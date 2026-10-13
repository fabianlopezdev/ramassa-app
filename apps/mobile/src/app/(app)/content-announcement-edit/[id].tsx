/**
 * Writing an announcement on the phone (RAPP-341), with the web admin's rules:
 * category, the Catalan title and text, an optional photo with its
 * description, pinning, and the publication (draft, now, or scheduled, with an
 * optional expiry). Translations are machine drafts from the Worker that she
 * corrects and approves per language; publishing needs every one approved.
 *
 * The text is kept on the device while she writes (`announcement-draft.ts`),
 * so leaving the screen loses nothing; it is removed once the save succeeds.
 * Without `announcements.publish` the publication is shown and kept as it is,
 * because the database refuses any change to it.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { ANNOUNCEMENT_CATEGORY_KEYS } from '@/components/content/announcement-labels';
import { DateTimeField } from '@/components/content/date-time-field';
import { MultilingualField } from '@/components/content/multilingual-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import {
  clearAnnouncementDraft,
  PUBLISH_MODES,
  readAnnouncementDraft,
  writeAnnouncementDraft,
  type AnnouncementDraft,
  type PublishMode,
} from '@/lib/announcement-draft';
import { uploadAnnouncementImage, useContentAnnouncement } from '@/lib/content-announcements';
import { playHaptic } from '@/lib/haptics/haptics';
import { safeAsync } from '@/lib/observability';
import { privateStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { requestCatalanTranslation } from '@/lib/translation-worker';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ANNOUNCEMENT_CATEGORIES,
  areAnnouncementTranslationsApproved,
  createAnnouncement,
  localizedTextFromReview,
  MAX_ANNOUNCEMENT_ALT_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
  updateAnnouncement,
  type AnnouncementListRow,
} from '@ramassa/shared/announcements';
import { useAuth } from '@ramassa/shared/auth';
import { getErrorMessageKey, type AppErrorCode } from '@ramassa/shared/errors';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';
import {
  MAX_TRANSLATION_TEXT_LENGTH,
  type CreateTranslationReviewOptions,
  type TranslationReview,
} from '@ramassa/shared/translation';
import { CATALAN_TRANSLATION_TARGETS } from '@ramassa/shared/translation/client';
import { useTranslationReview } from '@ramassa/shared/translation/react';

const MODE_KEYS = { draft: 'modeDraft', now: 'modeNow', scheduled: 'modeScheduled' } as const;

/** The stored translations, or the restored draft's, as review options. */
function reviewOptions(
  sourceText: string,
  translations: Partial<Record<string, string>> | null,
): CreateTranslationReviewOptions | undefined {
  if (translations === null) return undefined;
  const found = Object.fromEntries(
    CATALAN_TRANSLATION_TARGETS.flatMap((language) => {
      const text = translations[language];
      return typeof text === 'string' && text.length > 0 ? [[language, text]] : [];
    }),
  );
  if (Object.keys(found).length === 0) return undefined;
  return { sourceLanguage: 'ca', sourceText, translations: found };
}

function fromReview(review: TranslationReview | undefined): Record<string, string> | undefined {
  return review === undefined
    ? undefined
    : Object.fromEntries(review.suggestions.map((s) => [s.language, s.reviewedText]));
}

function initialMode(announcement: AnnouncementListRow | undefined): PublishMode {
  if (announcement === undefined || announcement.status === 'draft') return 'draft';
  return announcement.published_at !== null &&
    new Date(announcement.published_at).getTime() > Date.now()
    ? 'scheduled'
    : 'now';
}

function startingDraft(announcement: AnnouncementListRow | undefined): AnnouncementDraft {
  return {
    category: announcement?.category ?? 'info',
    title: announcement?.title.ca ?? '',
    body: announcement?.body.ca ?? '',
    imageAlt: announcement?.image_alt?.ca ?? '',
    imageUrl: announcement?.image_url ?? null,
    isPinned: announcement?.is_pinned ?? false,
    mode: initialMode(announcement),
    publishedAt: announcement?.published_at ?? null,
    expiresAt: announcement?.expires_at ?? null,
  };
}

function AnnouncementForm({
  announcementId,
  announcement,
}: {
  readonly announcementId: string;
  readonly announcement: AnnouncementListRow | undefined;
}) {
  const { t } = useTranslation('announcements');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const canPublish = useAccountAccess().permissions.has('announcements.publish');
  const [restored] = useState(() => readAnnouncementDraft(privateStorage, userId, announcementId));
  const [form, setForm] = useState<AnnouncementDraft>(
    () => restored ?? startingDraft(announcement),
  );
  const [photo, setPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  // Saved on the device only once she changes something, so opening a screen
  // and leaving it does not leave a draft behind.
  const [isTouched, setIsTouched] = useState(restored !== null);
  const set = (patch: Partial<AnnouncementDraft>) => {
    setIsTouched(true);
    setForm((current) => ({ ...current, ...patch }));
  };

  const titleReview = useTranslationReview(
    reviewOptions(form.title, restored?.titleTranslations ?? announcement?.title ?? null),
  );
  const bodyReview = useTranslationReview(
    reviewOptions(form.body, restored?.bodyTranslations ?? announcement?.body ?? null),
  );
  const imageAltReview = useTranslationReview(
    reviewOptions(form.imageAlt, restored?.imageAltTranslations ?? announcement?.image_alt ?? null),
  );
  const hasImage = photo !== null || form.imageUrl !== null;

  // Kept on the device as she writes, so leaving the screen loses nothing.
  useEffect(() => {
    if (userId.length === 0 || !isTouched) return;
    writeAnnouncementDraft(privateStorage, userId, announcementId, {
      ...form,
      titleTranslations: fromReview(titleReview.review),
      bodyTranslations: fromReview(bodyReview.review),
      imageAltTranslations: fromReview(imageAltReview.review),
    });
  }, [
    announcementId,
    bodyReview.review,
    form,
    imageAltReview.review,
    isTouched,
    titleReview.review,
    userId,
  ]);

  const generate = async () => {
    setErrorCode(null);
    setIsTouched(true);
    setIsGenerating(true);
    const requests = [
      { source: form.title, start: titleReview.start },
      { source: form.body, start: bodyReview.start },
      ...(hasImage ? [{ source: form.imageAlt, start: imageAltReview.start }] : []),
    ];
    const results = await Promise.all(
      requests.map(async (request) => ({
        ...request,
        result: await requestCatalanTranslation(request.source),
      })),
    );
    setIsGenerating(false);
    const failed = results.find((item) => !item.result.ok);
    if (failed !== undefined && !failed.result.ok) {
      setErrorCode(failed.result.error.code);
      return;
    }
    for (const item of results) {
      if (item.result.ok) {
        const generated = item.result.value;
        item.start({
          sourceLanguage: generated.sourceLanguage,
          sourceText: generated.sourceText,
          translations: Object.fromEntries(
            generated.suggestions.map((suggestion) => [
              suggestion.language,
              suggestion.machineText,
            ]),
          ),
        });
      }
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset !== undefined) setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  const publicationTime = (): string | null => {
    if (form.mode === 'draft') return null;
    if (form.mode === 'scheduled') return form.publishedAt;
    // Already live: keep the time it went out.
    if (
      announcement?.status === 'published' &&
      announcement.published_at !== null &&
      new Date(announcement.published_at).getTime() <= Date.now()
    ) {
      return announcement.published_at;
    }
    return new Date().toISOString();
  };

  const save = async () => {
    setErrorCode(null);
    const publishing = canPublish ? form.mode !== 'draft' : announcement?.status === 'published';
    if (
      publishing &&
      !areAnnouncementTranslationsApproved({
        titleReview: titleReview.review,
        bodyReview: bodyReview.review,
        imageAltReview: hasImage ? imageAltReview.review : undefined,
      })
    ) {
      setErrorCode('TRANSLATION-4');
      playHaptic('warning');
      return;
    }
    setIsSaving(true);
    const result = await safeAsync(
      async () => {
        const imageUrl = photo === null ? form.imageUrl : await uploadAnnouncementImage(photo);
        const input = {
          category: form.category,
          title: localizedTextFromReview(form.title, titleReview.review),
          body: localizedTextFromReview(form.body, bodyReview.review),
          imageUrl,
          imageAlt:
            imageUrl === null
              ? null
              : localizedTextFromReview(form.imageAlt, imageAltReview.review),
          isPinned: form.isPinned,
          // Without the publish permission the publication stays exactly as stored.
          status: canPublish
            ? form.mode === 'draft'
              ? ('draft' as const)
              : ('published' as const)
            : (announcement?.status ?? ('draft' as const)),
          publishedAt: canPublish ? publicationTime() : (announcement?.published_at ?? null),
          expiresAt: canPublish
            ? form.mode === 'draft'
              ? null
              : form.expiresAt
            : (announcement?.expires_at ?? null),
        };
        return announcement === undefined
          ? createAnnouncement(supabase, input)
          : updateAnnouncement(supabase, announcement.id, input);
      },
      { code: 'DB-1', context: { operation: announcement === undefined ? 'create' : 'update' } },
    );
    setIsSaving(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      playHaptic('error');
      return;
    }
    clearAnnouncementDraft(privateStorage, userId, announcementId);
    await queryClient.invalidateQueries({ queryKey: ['content', userId, 'announcements'] });
    playHaptic('success');
    back();
  };

  const reviewHandlers = (review: ReturnType<typeof useTranslationReview>) => ({
    review: review.review,
    onEdit: (language: SupportedLanguage, text: string) => {
      setIsTouched(true);
      review.edit(language, text);
    },
    onApprove: (language: SupportedLanguage) => {
      setIsTouched(true);
      review.approve(language);
    },
    onReject: (language: SupportedLanguage) => {
      setIsTouched(true);
      review.reject(language);
    },
    onApproveAll: () => {
      for (const suggestion of review.review?.suggestions ?? [])
        review.approve(suggestion.language);
    },
  });
  const canGenerate =
    form.title.trim().length > 0 &&
    form.body.trim().length > 0 &&
    (!hasImage || form.imageAlt.trim().length > 0);

  return (
    <WizardFrame
      title={announcement === undefined ? t('newAction') : t('editTitle')}
      continueLabel={
        !canPublish || form.mode === 'draft'
          ? announcement === undefined
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
          testID="announcement-draft-restored"
          className={`text-start text-sm text-neutral-700 ${fontClass}`}
        >
          {t('draftRestored')}
        </Text>
      )}
      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
          {t('fieldCategory')}
        </Text>
        <View className="flex-row flex-wrap gap-sm">
          {ANNOUNCEMENT_CATEGORIES.map((category) => (
            <ChoiceOption
              key={category}
              testID={`announcement-category-${category}`}
              value={category}
              label={t(ANNOUNCEMENT_CATEGORY_KEYS[category])}
              selected={category === form.category}
              onSelect={(value) => set({ category: value })}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>
      <MultilingualField
        testIDPrefix="title"
        label={t('fieldTitle')}
        value={form.title}
        onChangeText={(title) => set({ title })}
        maxLength={MAX_ANNOUNCEMENT_TITLE_LENGTH}
        {...reviewHandlers(titleReview)}
      />
      <MultilingualField
        testIDPrefix="body"
        label={t('fieldBody')}
        value={form.body}
        onChangeText={(body) => set({ body })}
        maxLength={MAX_TRANSLATION_TEXT_LENGTH}
        multiline
        {...reviewHandlers(bodyReview)}
      />

      <View className="gap-xs">
        <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
          {t('fieldImage')}
        </Text>
        {hasImage ? (
          <Text
            testID="announcement-image-state"
            className={`text-start text-sm text-neutral-700 ${fontClass}`}
          >
            {photo === null ? t('imageStored') : t('imageChosen')}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-md">
          <PressableScale
            testID="announcement-image-choose"
            accessibilityRole="button"
            accessibilityLabel={t('imageChoose')}
            onPress={() => void pickPhoto()}
            haptic="tapLight"
            className="min-h-recommended justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {t('imageChoose')}
            </Text>
          </PressableScale>
          {hasImage ? (
            <PressableScale
              testID="announcement-image-remove"
              accessibilityRole="button"
              accessibilityLabel={t('imageRemove')}
              onPress={() => {
                setPhoto(null);
                set({ imageUrl: null, imageAlt: '' });
                imageAltReview.reset();
              }}
              haptic="tapLight"
              className="min-h-recommended justify-center"
            >
              <Text className={`font-semibold text-error ${fontClass}`}>{t('imageRemove')}</Text>
            </PressableScale>
          ) : null}
        </View>
      </View>
      {hasImage ? (
        <MultilingualField
          testIDPrefix="image-alt"
          label={t('fieldImageAlt')}
          value={form.imageAlt}
          onChangeText={(imageAlt) => set({ imageAlt })}
          maxLength={MAX_ANNOUNCEMENT_ALT_LENGTH}
          {...reviewHandlers(imageAltReview)}
        />
      ) : null}

      <PressableScale
        testID="announcement-generate"
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
        {t('translationHelp')}
      </Text>

      <View className="flex-row items-center justify-between gap-md">
        <Text className={`flex-1 text-start text-md text-neutral-800 ${fontClass}`}>
          {t('fieldPinned')}
        </Text>
        <Switch
          testID="announcement-pinned"
          accessibilityLabel={t('fieldPinned')}
          value={form.isPinned}
          onValueChange={(isPinned) => set({ isPinned })}
          trackColor={{ true: tokens.colors.primary.DEFAULT }}
        />
      </View>

      <View className="gap-sm">
        <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
          {t('modeLabel')}
        </Text>
        {canPublish ? (
          <>
            <View className="flex-row flex-wrap gap-sm">
              {PUBLISH_MODES.map((mode) => (
                <ChoiceOption
                  key={mode}
                  testID={`announcement-mode-${mode}`}
                  value={mode}
                  label={t(MODE_KEYS[mode])}
                  selected={mode === form.mode}
                  onSelect={(value) => set({ mode: value })}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
            {form.mode === 'scheduled' ? (
              <DateTimeField
                testID="announcement-published-at"
                label={t('publishedAt')}
                value={form.publishedAt}
                onChange={(publishedAt) => set({ publishedAt })}
              />
            ) : null}
            {form.mode === 'draft' ? null : (
              <DateTimeField
                testID="announcement-expires-at"
                label={t('expiresAt')}
                value={form.expiresAt}
                onChange={(expiresAt) => set({ expiresAt })}
                emptyLabel={t('noExpiry')}
              />
            )}
          </>
        ) : (
          <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
            {`${t(MODE_KEYS[initialMode(announcement)])}. ${t('publishLocked')}`}
          </Text>
        )}
      </View>

      {errorCode === null ? null : (
        <FailureNotice
          code={errorCode}
          message={
            errorCode === 'TRANSLATION-4'
              ? t(hasImage ? 'imageAltRequired' : 'translationRequired')
              : t(getErrorMessageKey(errorCode))
          }
        />
      )}
    </WizardFrame>
  );
}

export default function AnnouncementEditScreen() {
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const announcement = useContentAnnouncement(isNew ? '' : id);
  const { t } = useTranslation('announcements');
  if (!isNew && announcement.data === undefined) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        {announcement.isError ? (
          <Text className="p-lg text-start text-md text-error">{t('loadFailed')}</Text>
        ) : (
          <AnnouncementFeedSkeleton accessibilityLabel={t('editTitle')} />
        )}
      </SafeAreaView>
    );
  }
  return (
    <AnnouncementForm announcementId={id} announcement={isNew ? undefined : announcement.data} />
  );
}
