/**
 * The service form (RAPP-344): writing a service on the phone, with the web admin's fields and
 * rules: category, the Catalan title and description with their translations,
 * provider, place, cost, contact, schedule, link and availability, the
 * category's own extra fields, up to twelve photos with translated
 * descriptions, and the publication (draft, now or scheduled, with an optional
 * expiry). Publishing needs every translation approved.
 *
 * The form is kept on the device while she writes (`service-draft.ts`); a
 * chosen photo is not kept, as it is uploaded only at save. Without
 * `services.publish` the publication is shown and kept as it is.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { DateTimeField } from '@/components/content/date-time-field';
import { MultilingualField } from '@/components/content/multilingual-field';
import { ServiceImagesField } from '@/components/content/service-images-field';
import { SERVICE_AVAILABILITY_KEYS, SERVICE_COST_KEYS } from '@/components/content/service-labels';
import { ServiceMetadataFields } from '@/components/content/service-metadata-fields';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { PUBLISH_MODES } from '@/lib/announcement-draft';
import { serviceReviewsRoot } from '@/lib/content-service-reviews';
import { contentServicesRoot } from '@/lib/content-services';
import { reviewHandlers, reviewOptions, reviewTexts } from '@/lib/content-translations';
import { uploadContentImage, type PickedPhoto } from '@/lib/content-upload';
import { playHaptic } from '@/lib/haptics/haptics';
import { safeAsync } from '@/lib/observability';
import {
  areServiceTranslationsApproved,
  clearServiceDraft,
  initialServiceMode,
  isServicePublishing,
  MAX_SERVICE_IMAGES,
  moveImage,
  readServiceDraft,
  startingServiceDraft,
  toServiceInput,
  withCategory,
  writeServiceDraft,
  type ServiceDraft,
} from '@/lib/service-draft';
import { privateStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { generateDrafts } from '@/lib/translation-worker';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type KeyboardTypeOptions } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { AppError, getErrorMessageKey, type AppErrorCode } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@ramassa/shared/i18n';
import {
  approveEntityService,
  createAdminServiceInputSchema,
  saveAdminService,
  SERVICE_AVAILABILITIES,
  SERVICE_COST_TYPES,
  type AdminServiceCategory,
  type AdminServiceDetail,
} from '@ramassa/shared/services';
import {
  approveTranslation,
  createTranslationReview,
  editTranslationDraft,
  rejectTranslation,
  type CreateTranslationReviewOptions,
  type TranslationReview,
} from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';

const MODE_KEYS = { draft: 'modeDraft', now: 'modeNow', scheduled: 'modeScheduled' } as const;
const PENDING_UPLOAD = 'pending-upload';

type FormError = AppErrorCode | 'invalid';
type TextKey =
  | 'providerName'
  | 'location'
  | 'zone'
  | 'costAmount'
  | 'costDetails'
  | 'contactName'
  | 'contactPhone'
  | 'contactEmail'
  | 'contactRole'
  | 'schedule'
  | 'externalUrl';

const TEXT_FIELDS: readonly {
  readonly key: TextKey;
  readonly label: string;
  readonly keyboard?: KeyboardTypeOptions;
  readonly isLink?: boolean;
}[] = [
  { key: 'providerName', label: 'fieldProviderName' },
  { key: 'location', label: 'fieldLocation' },
  { key: 'zone', label: 'fieldZone' },
];
const CONTACT_FIELDS: typeof TEXT_FIELDS = [
  { key: 'contactName', label: 'fieldContactName' },
  { key: 'contactRole', label: 'fieldContactRole' },
  { key: 'contactPhone', label: 'fieldContactPhone', keyboard: 'phone-pad' },
  { key: 'contactEmail', label: 'fieldContactEmail', keyboard: 'email-address', isLink: true },
  { key: 'schedule', label: 'fieldSchedule' },
  { key: 'externalUrl', label: 'fieldExternalUrl', keyboard: 'url', isLink: true },
];

function SectionLabel({ children }: { readonly children: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
      {children}
    </Text>
  );
}

function startImageReview(
  alt: string,
  translations: Partial<Record<string, string>> | null,
): TranslationReview | undefined {
  const options = reviewOptions(alt, translations);
  return options === undefined ? undefined : createTranslationReview(options);
}

let imageCounter = 0;
const newImageKey = () => `new-${Date.now().toString(36)}-${(imageCounter += 1)}`;

export function ServiceForm({
  serviceId,
  detail,
  categories,
  isApproval = false,
}: {
  readonly serviceId: string;
  readonly detail: AdminServiceDetail | undefined;
  readonly categories: readonly AdminServiceCategory[];
  /**
   * Approving an entity's pending submission (RAPP-345): the service is
   * published at once with the reviewer's corrections and an optional comment
   * the entity sees, as the web admin's approval editor does.
   */
  readonly isApproval?: boolean;
}) {
  const { t, i18n } = useTranslation('services');
  const { t: tAnnouncements } = useTranslation('announcements');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const { back, dismissTo } = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const hasPublish = useAccountAccess().permissions.has('services.publish');
  // Approving publishes; the database checks the review permission.
  const canPublish = hasPublish || isApproval;
  const draftId = isApproval ? `approve-${serviceId}` : serviceId;
  const [approvalComment, setApprovalComment] = useState('');
  const storedCategory = categories.find((category) => category.id === detail?.service.category_id);
  const [restored] = useState(() => readServiceDraft(privateStorage, userId, draftId));
  const [form, setForm] = useState<ServiceDraft>(() => {
    const start = restored ?? startingServiceDraft(detail, storedCategory ?? categories[0]);
    return isApproval ? { ...start, mode: 'now' } : start;
  });
  const category = categories.find((candidate) => candidate.id === form.categoryId);
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, PickedPhoto>>({});
  const [imageReviews, setImageReviews] = useState<Record<string, TranslationReview | undefined>>(
    () =>
      Object.fromEntries(
        form.images.map((image) => {
          const stored = detail?.images.find((candidate) => candidate.id === image.key);
          return [
            image.key,
            startImageReview(image.alt, image.altTranslations ?? stored?.alt_text ?? null),
          ];
        }),
      ),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  // Saved on the device only once she changes something, so opening a screen
  // and leaving it does not leave a draft behind.
  const [isTouched, setIsTouched] = useState(restored !== null);
  const touch = () => setIsTouched(true);
  const set = (patch: Partial<ServiceDraft>) => {
    touch();
    setForm((current) => ({ ...current, ...patch }));
  };

  const titleReview = useTranslationReview(
    reviewOptions(form.title, restored?.titleTranslations ?? detail?.service.title ?? null),
  );
  const descriptionReview = useTranslationReview(
    reviewOptions(
      form.description,
      restored?.descriptionTranslations ?? detail?.service.description ?? null,
    ),
  );
  const reviews = {
    title: titleReview.review,
    description: descriptionReview.review,
    images: imageReviews,
  };
  const pendingSet = useMemo(() => new Set(Object.keys(pendingPhotos)), [pendingPhotos]);

  useEffect(() => {
    if (userId.length === 0 || !isTouched) return;
    writeServiceDraft(privateStorage, userId, draftId, {
      ...form,
      images: form.images.map((image) => ({
        ...image,
        altTranslations: reviewTexts(imageReviews[image.key]),
      })),
      titleTranslations: reviewTexts(titleReview.review),
      descriptionTranslations: reviewTexts(descriptionReview.review),
    });
  }, [
    descriptionReview.review,
    form,
    imageReviews,
    isTouched,
    serviceId,
    titleReview.review,
    userId,
  ]);

  const updateImageReview = (
    key: string,
    change: (review: TranslationReview) => TranslationReview,
  ) => {
    touch();
    setImageReviews((current) => {
      const review = current[key];
      return review === undefined ? current : { ...current, [key]: change(review) };
    });
  };
  const imageHandlers = {
    onEdit: (key: string, lang: SupportedLanguage, text: string) =>
      updateImageReview(key, (review) => editTranslationDraft(review, lang, text)),
    onApprove: (key: string, lang: SupportedLanguage) =>
      updateImageReview(key, (review) => approveTranslation(review, lang)),
    onReject: (key: string, lang: SupportedLanguage) =>
      updateImageReview(key, (review) => rejectTranslation(review, lang)),
    onApproveAll: (key: string) =>
      updateImageReview(key, (review) =>
        review.suggestions.reduce((next, s) => approveTranslation(next, s.language), review),
      ),
  };

  const canGenerate =
    form.title.trim().length > 0 && form.images.every((image) => image.alt.trim().length > 0);
  // The image keys at the time of a request, so a late answer cannot land on a removed photo.
  const requestImages = useRef<readonly string[]>([]);

  const generate = async () => {
    setError(null);
    touch();
    setIsGenerating(true);
    requestImages.current = form.images.map((image) => image.key);
    const imageStarts = form.images.map((image) => ({
      source: image.alt,
      start: (options: CreateTranslationReviewOptions) =>
        setImageReviews((current) =>
          requestImages.current.includes(image.key)
            ? { ...current, [image.key]: createTranslationReview(options) }
            : current,
        ),
    }));
    const failure = await generateDrafts([
      { source: form.title, start: titleReview.start },
      ...(form.description.trim().length > 0
        ? [{ source: form.description, start: descriptionReview.start }]
        : []),
      ...imageStarts,
    ]);
    setIsGenerating(false);
    if (failure !== null) setError(failure);
  };

  const save = async () => {
    setError(null);
    if (category === undefined) return;
    if (
      isServicePublishing(form, detail, canPublish) &&
      !areServiceTranslationsApproved(form, reviews)
    ) {
      setError('TRANSLATION-4');
      playHaptic('warning');
      return;
    }
    const context = { category, detail, canPublish };
    const schema = createAdminServiceInputSchema(category);
    // Checked with stand-ins first, so nothing is uploaded for a form that cannot save.
    const placeholders = Object.fromEntries([...pendingSet].map((key) => [key, PENDING_UPLOAD]));
    if (
      !schema.safeParse(toServiceInput(form, reviews, { ...context, imageUrls: placeholders }))
        .success
    ) {
      setError('invalid');
      playHaptic('warning');
      return;
    }
    setIsSaving(true);
    const result = await safeAsync(
      async () => {
        const uploaded = await Promise.all(
          Object.entries(pendingPhotos)
            .filter(([key]) => form.images.some((image) => image.key === key))
            .map(
              async ([key, photo]) => [key, await uploadContentImage('services', photo)] as const,
            ),
        );
        const input = toServiceInput(form, reviews, {
          ...context,
          imageUrls: Object.fromEntries(uploaded),
        });
        if (!schema.safeParse(input).success) throw new AppError('VALIDATION-1');
        if (isApproval && detail !== undefined) {
          return approveEntityService(
            supabase,
            category,
            detail.service.id,
            input,
            approvalComment.trim() || null,
          );
        }
        return saveAdminService(supabase, category, input, detail?.service.id ?? null);
      },
      {
        code: 'DB-1',
        context: {
          operation: isApproval ? 'approve-submission' : detail === undefined ? 'create' : 'update',
        },
      },
    );
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error.code);
      playHaptic('error');
      return;
    }
    clearServiceDraft(privateStorage, userId, draftId);
    await queryClient.invalidateQueries({ queryKey: contentServicesRoot(userId) });
    playHaptic('success');
    if (isApproval) {
      await queryClient.invalidateQueries({ queryKey: serviceReviewsRoot(userId) });
      // The item has left the queue, so she goes back to the queue itself.
      dismissTo({ pathname: '/content', params: { kind: 'reviews' } } as Href);
      return;
    }
    back();
  };

  const errorMessage =
    error === null
      ? null
      : error === 'invalid'
        ? t('formInvalid')
        : error === 'TRANSLATION-4'
          ? tAnnouncements('translationRequired')
          : tErrors(getErrorMessageKey(error));

  const textField = (field: (typeof TEXT_FIELDS)[number]) => (
    <AuthTextField
      key={field.key}
      testID={`service-${field.key}`}
      label={t(field.label)}
      value={form[field.key]}
      onChangeText={(value) => set({ [field.key]: value })}
      keyboardType={field.keyboard}
      autoCapitalize={field.isLink ? 'none' : undefined}
      autoCorrect={field.isLink ? false : undefined}
    />
  );

  return (
    <WizardFrame
      title={
        isApproval ? t('reviewEditTitle') : detail === undefined ? t('newAction') : t('editTitle')
      }
      continueLabel={isApproval ? t('reviewApprove') : t('save')}
      onContinue={() => void save()}
      isContinueBusy={isSaving}
      onBack={back}
    >
      {restored === null ? null : (
        <Text
          testID="service-draft-restored"
          className={`text-start text-sm text-neutral-700 ${fontClass}`}
        >
          {tAnnouncements('draftRestored')}
        </Text>
      )}

      <View className="gap-xs">
        <SectionLabel>{t('fieldCategory')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {categories.map((candidate) => (
            <ChoiceOption
              key={candidate.id}
              testID={`service-category-${candidate.slug}`}
              value={candidate.id}
              label={candidate.name[language] ?? candidate.name.ca}
              selected={candidate.id === form.categoryId}
              onSelect={() => {
                if (candidate.id === form.categoryId) return;
                touch();
                setForm((current) => withCategory(current, candidate));
              }}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>

      <MultilingualField
        testIDPrefix="service-title"
        label={t('fieldTitle')}
        value={form.title}
        onChangeText={(title) => {
          set({ title });
          titleReview.reset();
        }}
        maxLength={300}
        {...reviewHandlers(titleReview, touch)}
      />
      <MultilingualField
        testIDPrefix="service-description"
        label={t('fieldDescription')}
        value={form.description}
        onChangeText={(description) => {
          set({ description });
          descriptionReview.reset();
        }}
        maxLength={10_000}
        multiline
        {...reviewHandlers(descriptionReview, touch)}
      />

      {TEXT_FIELDS.map(textField)}
      <View className="gap-xs">
        <SectionLabel>{t('fieldCostType')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {SERVICE_COST_TYPES.map((costType) => (
            <ChoiceOption
              key={costType}
              testID={`service-cost-${costType}`}
              value={costType}
              label={t(SERVICE_COST_KEYS[costType])}
              selected={costType === form.costType}
              onSelect={(value) =>
                set(value === 'free' ? { costType: value, costAmount: '' } : { costType: value })
              }
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>
      {form.costType === 'free' ? null : (
        <AuthTextField
          testID="service-costAmount"
          label={t('fieldCostAmount')}
          value={form.costAmount}
          onChangeText={(costAmount) => set({ costAmount })}
          keyboardType="decimal-pad"
        />
      )}
      {textField({ key: 'costDetails', label: 'fieldCostDetails' })}
      {CONTACT_FIELDS.map(textField)}
      <View className="gap-xs">
        <SectionLabel>{t('fieldAvailability')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {SERVICE_AVAILABILITIES.map((availability) => (
            <ChoiceOption
              key={availability}
              testID={`service-availability-${availability}`}
              value={availability}
              label={t(SERVICE_AVAILABILITY_KEYS[availability])}
              selected={availability === form.availability}
              onSelect={(value) => set({ availability: value })}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>

      {category === undefined ? null : (
        <ServiceMetadataFields
          // Another category has other fields, so its controls start again.
          key={category.id}
          fields={category.definition.fields}
          values={form.metadata}
          language={language}
          onChange={(key, value) => set({ metadata: { ...form.metadata, [key]: value } })}
        />
      )}

      <ServiceImagesField
        images={form.images}
        pendingPhotos={pendingSet}
        reviews={imageReviews}
        handlers={imageHandlers}
        onAdd={() => {
          if (form.images.length >= MAX_SERVICE_IMAGES) return;
          set({ images: [...form.images, { key: newImageKey(), url: null, alt: '' }] });
        }}
        onPick={(key, photo) => {
          touch();
          setPendingPhotos((current) => ({ ...current, [key]: photo }));
        }}
        onAltChange={(key, alt) => {
          set({
            images: form.images.map((image) => (image.key === key ? { ...image, alt } : image)),
          });
          setImageReviews((current) => ({ ...current, [key]: undefined }));
        }}
        onMove={(index, offset) => set({ images: [...moveImage(form.images, index, offset)] })}
        onRemove={(key) => {
          set({ images: form.images.filter((image) => image.key !== key) });
          setPendingPhotos((current) =>
            Object.fromEntries(Object.entries(current).filter(([candidate]) => candidate !== key)),
          );
        }}
      />

      <PressableScale
        testID="service-generate"
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

      {isApproval ? (
        <View className="gap-xs">
          <AuthTextField
            testID="service-review-approval-comment"
            label={t('reviewApprovalComment')}
            value={approvalComment}
            onChangeText={setApprovalComment}
            maxLength={4_000}
            multiline
          />
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('reviewApprovalCommentHelp')}
          </Text>
        </View>
      ) : null}
      <View className="gap-sm">
        <SectionLabel>{t('modeLabel')}</SectionLabel>
        {isApproval ? (
          <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>{t('modeNow')}</Text>
        ) : canPublish ? (
          <>
            <View className="flex-row flex-wrap gap-sm">
              {PUBLISH_MODES.map((mode) => (
                <ChoiceOption
                  key={mode}
                  testID={`service-mode-${mode}`}
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
                testID="service-published-at"
                label={t('publishedAt')}
                value={form.publishedAt}
                onChange={(publishedAt) => set({ publishedAt })}
              />
            ) : null}
            {form.mode === 'draft' ? null : (
              <DateTimeField
                testID="service-expires-at"
                label={t('expiresAt')}
                value={form.expiresAt}
                onChange={(expiresAt) => set({ expiresAt })}
                emptyLabel={tAnnouncements('noExpiry')}
              />
            )}
          </>
        ) : (
          <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
            {`${t(MODE_KEYS[initialServiceMode(detail)])}. ${tAnnouncements('publishLocked')}`}
          </Text>
        )}
      </View>

      {error === null || errorMessage === null ? null : (
        <FailureNotice code={error === 'invalid' ? 'VALIDATION-1' : error} message={errorMessage} />
      )}
    </WizardFrame>
  );
}
