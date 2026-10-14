/**
 * Writing an event on the phone (RAPP-342), with the web admin's fields and
 * rules: category, the Catalan title and an optional description with their
 * translations, the place and its map link, the schedule in Madrid time (once,
 * or weekly with a number of sessions), places, the sign-up mode, and the
 * publication (draft, now or scheduled, with an optional expiry). Publishing
 * needs every translation approved. The database makes the sessions from the
 * schedule.
 *
 * The form is kept on the device while she writes (`event-draft.ts`), so
 * leaving the screen loses nothing; it is removed once the save succeeds.
 * Without `events.publish` the publication is shown and kept as it is.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { DateTimeField } from '@/components/content/date-time-field';
import { EventCategoryGlyph } from '@/components/content/event-category-badge';
import { EVENT_SIGNUP_KEYS } from '@/components/content/event-labels';
import { MultilingualField } from '@/components/content/multilingual-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { PUBLISH_MODES } from '@/lib/announcement-draft';
import {
  contentEventsRoot,
  useContentEvent,
  useContentEventCategories,
} from '@/lib/content-events';
import { reviewHandlers, reviewOptions, reviewTexts } from '@/lib/content-translations';
import {
  clearEventDraft,
  EVENT_RECURRENCES,
  initialEventMode,
  isEventPublishing,
  readEventDraft,
  startingEventDraft,
  toEventInput,
  writeEventDraft,
  type EventDraft,
} from '@/lib/event-draft';
import { playHaptic } from '@/lib/haptics/haptics';
import { safeAsync } from '@/lib/observability';
import { privateStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { generateDrafts } from '@/lib/translation-worker';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { getErrorMessageKey, type AppErrorCode } from '@ramassa/shared/errors';
import {
  areEventTranslationsApproved,
  createEvent,
  EVENT_SIGNUP_MODES,
  eventInputSchema,
  MAX_EVENT_LOCATION_LENGTH,
  MAX_EVENT_RECURRENCE_INTERVAL,
  MAX_EVENT_TITLE_LENGTH,
  updateEvent,
  type EventCategoryRow,
  type EventListRow,
} from '@ramassa/shared/events';
import { MAX_TRANSLATION_TEXT_LENGTH } from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';

const MODE_KEYS = { draft: 'modeDraft', now: 'modeNow', scheduled: 'modeScheduled' } as const;
const RECURRENCE_KEYS = { one_off: 'recurrenceOneOff', weekly: 'recurrenceWeekly' } as const;
const INTERVALS = Array.from({ length: MAX_EVENT_RECURRENCE_INTERVAL }, (_unused, i) => i + 1);

type FormError = AppErrorCode | 'invalid';

function SectionLabel({ children }: { readonly children: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
      {children}
    </Text>
  );
}

function EventForm({
  eventId,
  event,
  categories,
}: {
  readonly eventId: string;
  readonly event: EventListRow | undefined;
  readonly categories: readonly EventCategoryRow[];
}) {
  const { t } = useTranslation('events');
  const { t: tAnnouncements } = useTranslation('announcements');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { back, push } = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { permissions } = useAccountAccess();
  const canPublish = permissions.has('events.publish');
  const canEditCategories = permissions.has('events.edit');
  const [restored] = useState(() => readEventDraft(privateStorage, userId, eventId));
  const [form, setForm] = useState<EventDraft>(
    () => restored ?? startingEventDraft(event, categories[0]?.id ?? ''),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  // Saved on the device only once she changes something, so opening a screen
  // and leaving it does not leave a draft behind.
  const [isTouched, setIsTouched] = useState(restored !== null);
  const touch = () => setIsTouched(true);
  const set = (patch: Partial<EventDraft>) => {
    touch();
    setForm((current) => ({ ...current, ...patch }));
  };

  const titleReview = useTranslationReview(
    reviewOptions(form.title, restored?.titleTranslations ?? event?.title ?? null),
  );
  const descriptionReview = useTranslationReview(
    reviewOptions(
      form.description,
      restored?.descriptionTranslations ?? event?.description ?? null,
    ),
  );
  const hasDescription = form.description.trim().length > 0;

  useEffect(() => {
    if (userId.length === 0 || !isTouched) return;
    writeEventDraft(privateStorage, userId, eventId, {
      ...form,
      titleTranslations: reviewTexts(titleReview.review),
      descriptionTranslations: reviewTexts(descriptionReview.review),
    });
  }, [descriptionReview.review, eventId, form, isTouched, titleReview.review, userId]);

  const generate = async () => {
    setError(null);
    touch();
    setIsGenerating(true);
    const failure = await generateDrafts([
      { source: form.title, start: titleReview.start },
      ...(hasDescription ? [{ source: form.description, start: descriptionReview.start }] : []),
    ]);
    setIsGenerating(false);
    if (failure !== null) setError(failure);
  };

  const save = async () => {
    setError(null);
    if (
      isEventPublishing(form, event, canPublish) &&
      !areEventTranslationsApproved(
        { titleReview: titleReview.review, descriptionReview: descriptionReview.review },
        hasDescription,
      )
    ) {
      setError('TRANSLATION-4');
      playHaptic('warning');
      return;
    }
    const input = toEventInput(
      form,
      { title: titleReview.review, description: descriptionReview.review },
      { stored: event, canPublish },
    );
    if (!eventInputSchema.safeParse(input).success) {
      setError('invalid');
      playHaptic('warning');
      return;
    }
    setIsSaving(true);
    const result = await safeAsync(
      () =>
        event === undefined ? createEvent(supabase, input) : updateEvent(supabase, event.id, input),
      {
        code: 'DB-1',
        context: { operation: event === undefined ? 'create-event' : 'update-event' },
      },
    );
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error.code);
      playHaptic('error');
      return;
    }
    clearEventDraft(privateStorage, userId, eventId);
    await queryClient.invalidateQueries({ queryKey: contentEventsRoot(userId) });
    playHaptic('success');
    back();
  };

  const canGenerate = form.title.trim().length > 0;
  const errorMessage =
    error === null
      ? null
      : error === 'invalid'
        ? t('invalidForm')
        : error === 'TRANSLATION-4'
          ? t('translationRequired')
          : tErrors(getErrorMessageKey(error));

  return (
    <WizardFrame
      title={event === undefined ? t('newAction') : t('editTitle')}
      continueLabel={
        !canPublish || form.mode === 'draft'
          ? event === undefined
            ? t('saveDraft')
            : t('update')
          : t('publish')
      }
      onContinue={() => void save()}
      isContinueBusy={isSaving}
      onBack={back}
    >
      {restored === null ? null : (
        <Text
          testID="event-draft-restored"
          className={`text-start text-sm text-neutral-700 ${fontClass}`}
        >
          {tAnnouncements('draftRestored')}
        </Text>
      )}

      <View className="gap-xs">
        <SectionLabel>{t('fieldCategory')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {categories.map((category) => (
            <View key={category.id} className="flex-row items-center gap-xs">
              <EventCategoryGlyph category={category} />
              <ChoiceOption
                testID={`event-category-${category.id}`}
                value={category.id}
                label={category.name.ca}
                selected={category.id === form.categoryId}
                onSelect={(categoryId) => set({ categoryId })}
                languageFontClass={fontClass}
              />
            </View>
          ))}
        </View>
        {canEditCategories ? (
          <PressableScale
            testID="event-manage-categories"
            accessibilityRole="button"
            accessibilityLabel={t('manageCategories')}
            onPress={() => push('/content-event-categories' as Href)}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {t('manageCategories')}
            </Text>
          </PressableScale>
        ) : null}
      </View>

      <MultilingualField
        testIDPrefix="event-title"
        label={t('fieldTitle')}
        value={form.title}
        onChangeText={(title) => {
          set({ title });
          titleReview.reset();
        }}
        maxLength={MAX_EVENT_TITLE_LENGTH}
        {...reviewHandlers(titleReview, touch)}
      />
      <MultilingualField
        testIDPrefix="event-description"
        label={t('fieldDescription')}
        value={form.description}
        onChangeText={(description) => {
          set({ description });
          descriptionReview.reset();
        }}
        maxLength={MAX_TRANSLATION_TEXT_LENGTH}
        multiline
        {...reviewHandlers(descriptionReview, touch)}
      />
      <PressableScale
        testID="event-generate"
        accessibilityRole="button"
        accessibilityLabel={isGenerating ? t('generatingTranslations') : t('generateTranslations')}
        onPress={() => void generate()}
        isBusy={isGenerating}
        isDisabled={!canGenerate}
        haptic="tapLight"
        className={`min-h-recommended items-center justify-center rounded-md border px-lg ${
          canGenerate ? 'border-primary bg-white' : 'border-neutral-200 bg-neutral-100'
        }`}
      >
        <Text
          className={`text-center text-md font-bold ${canGenerate ? 'text-primary-dark' : 'text-neutral-500'} ${fontClass}`}
        >
          {isGenerating ? t('generatingTranslations') : t('generateTranslations')}
        </Text>
      </PressableScale>
      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
        {tAnnouncements('translationHelp')}
      </Text>

      <AuthTextField
        testID="event-location"
        label={t('fieldLocation')}
        value={form.location}
        onChangeText={(location) => set({ location })}
        maxLength={MAX_EVENT_LOCATION_LENGTH}
      />
      <AuthTextField
        testID="event-location-url"
        label={t('fieldLocationUrl')}
        value={form.locationUrl}
        onChangeText={(locationUrl) => set({ locationUrl })}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View className="gap-xs">
        <SectionLabel>{t('fieldRecurrence')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {EVENT_RECURRENCES.map((recurrence) => (
            <ChoiceOption
              key={recurrence}
              testID={`event-recurrence-${recurrence}`}
              value={recurrence}
              label={t(RECURRENCE_KEYS[recurrence])}
              selected={recurrence === form.recurrence}
              onSelect={(value) => set({ recurrence: value })}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>
      <DateTimeField
        testID="event-starts-at"
        label={t('fieldStartsAt')}
        value={form.startsAt}
        onChange={(startsAt) => set({ startsAt })}
        inMadridTime
      />
      <DateTimeField
        testID="event-ends-at"
        label={t('fieldEndsAt')}
        value={form.endsAt}
        onChange={(endsAt) => set({ endsAt })}
        emptyLabel={t('none')}
        inMadridTime
      />
      {form.recurrence === 'weekly' ? (
        <>
          <View className="gap-xs">
            <SectionLabel>{t('fieldInterval')}</SectionLabel>
            <View className="flex-row flex-wrap gap-sm">
              {INTERVALS.map((interval) => (
                <ChoiceOption
                  key={interval}
                  testID={`event-interval-${interval}`}
                  value={String(interval)}
                  label={String(interval)}
                  selected={interval === form.interval}
                  onSelect={(value) => set({ interval: Number(value) })}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
          </View>
          <AuthTextField
            testID="event-count"
            label={t('fieldCount')}
            value={form.count}
            onChangeText={(count) => set({ count })}
            keyboardType="number-pad"
            maxLength={2}
          />
        </>
      ) : null}

      <AuthTextField
        testID="event-capacity"
        label={t('fieldCapacity')}
        value={form.capacity}
        onChangeText={(capacity) => set({ capacity })}
        keyboardType="number-pad"
        maxLength={5}
      />
      <View className="gap-xs">
        <SectionLabel>{t('fieldSignup')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {EVENT_SIGNUP_MODES.map((signupMode) => (
            <ChoiceOption
              key={signupMode}
              testID={`event-signup-${signupMode}`}
              value={signupMode}
              label={t(EVENT_SIGNUP_KEYS[signupMode])}
              selected={signupMode === form.signupMode}
              onSelect={(value) => set({ signupMode: value })}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>

      <View className="gap-sm">
        <SectionLabel>{tAnnouncements('modeLabel')}</SectionLabel>
        {canPublish ? (
          <>
            <View className="flex-row flex-wrap gap-sm">
              {PUBLISH_MODES.map((mode) => (
                <ChoiceOption
                  key={mode}
                  testID={`event-mode-${mode}`}
                  value={mode}
                  label={tAnnouncements(MODE_KEYS[mode])}
                  selected={mode === form.mode}
                  onSelect={(value) => set({ mode: value })}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
            {form.mode === 'scheduled' ? (
              <DateTimeField
                testID="event-published-at"
                label={tAnnouncements('publishedAt')}
                value={form.publishedAt}
                onChange={(publishedAt) => set({ publishedAt })}
              />
            ) : null}
            {form.mode === 'draft' ? null : (
              <DateTimeField
                testID="event-expires-at"
                label={tAnnouncements('expiresAt')}
                value={form.expiresAt}
                onChange={(expiresAt) => set({ expiresAt })}
                emptyLabel={tAnnouncements('noExpiry')}
              />
            )}
          </>
        ) : (
          <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
            {`${tAnnouncements(MODE_KEYS[initialEventMode(event)])}. ${tAnnouncements('publishLocked')}`}
          </Text>
        )}
      </View>

      {error === null || errorMessage === null ? null : (
        <FailureNotice code={error === 'invalid' ? 'VALIDATION-1' : error} message={errorMessage} />
      )}
    </WizardFrame>
  );
}

export default function EventEditScreen() {
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const event = useContentEvent(isNew ? '' : id);
  const categories = useContentEventCategories();
  const { t } = useTranslation('events');
  if ((!isNew && event.data === undefined) || categories.data === undefined) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        {event.isError || categories.isError ? (
          <Text className="p-lg text-start text-md text-error">{t('playerLoadFailed')}</Text>
        ) : (
          <AnnouncementFeedSkeleton accessibilityLabel={t('editTitle')} />
        )}
      </SafeAreaView>
    );
  }
  return (
    <EventForm eventId={id} event={isNew ? undefined : event.data} categories={categories.data} />
  );
}
