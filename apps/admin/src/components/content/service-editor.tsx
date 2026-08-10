import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { requestCatalanTranslation } from '@/lib/translation-worker';
import { useState, type FormEvent } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import { AppError, type AppErrorCode } from '@ramassa/shared/errors';
import { compressBrowserImage } from '@ramassa/shared/image-compression';
import { uploadContentTypeSchema } from '@ramassa/shared/schemas';
import {
  createAdminServiceInputSchema,
  saveAdminService,
  type AdminServiceCategory,
  type AdminServiceDetail,
} from '@ramassa/shared/services';
import {
  approveTranslation,
  createTranslationReview,
  editTranslationDraft,
  isTranslationReviewPublishable,
  rejectTranslation,
  type TranslationReview,
} from '@ramassa/shared/translation';
import { uploadFile } from '@ramassa/shared/upload-client';
import { approveAll, reviewOptions } from './announcement-editor';
import { ImageUploadField, type ImageUploadState } from './image-upload-field';
import { MultilingualEditor } from './multilingual-editor';
import { ScheduledPublishFields, type PublishMode } from './scheduled-publish-fields';
import { ServiceMetadataFields } from './service-metadata-fields';
import { TranslationReviewPanel } from './translation-review-panel';

interface ServiceFormValues {
  readonly providerName: string;
  readonly location: string;
  readonly zone: string;
  readonly costType: 'free' | 'paid' | 'subsidized' | 'varies';
  readonly costAmount: string;
  readonly costDetails: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly contactEmail: string;
  readonly contactRole: string;
  readonly schedule: string;
  readonly externalUrl: string;
  readonly availability: 'available' | 'waiting_list' | 'by_appointment' | 'full';
  readonly metadata: Record<string, unknown>;
}

interface ServiceImageDraft {
  readonly key: string;
  readonly url: string | null;
  readonly file: File | null;
  readonly alt: string;
  readonly review: TranslationReview | undefined;
  readonly state: ImageUploadState;
}

export interface ServiceEditorProps {
  readonly categories: readonly AdminServiceCategory[];
  readonly detail?: AdminServiceDetail;
  readonly onSaved: (serviceId: string) => void | Promise<void>;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function localDateTime(value: string | null): string {
  if (value === null) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialMode(detail: AdminServiceDetail | undefined): PublishMode {
  if (detail === undefined || detail.service.status !== 'published') return 'draft';
  if (
    detail.service.published_at !== null &&
    new Date(detail.service.published_at).getTime() > Date.now()
  ) {
    return 'scheduled';
  }
  return 'now';
}

export function serviceMetadataDefaults(
  category: AdminServiceCategory,
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  return Object.fromEntries(
    category.definition.fields.map((field) => [
      field.key,
      existing[field.key] ??
        (field.type === 'boolean' ? false : field.type === 'string-array' ? [] : ''),
    ]),
  );
}

export function normalizedServiceMetadata(
  category: AdminServiceCategory,
  values: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    category.definition.fields.flatMap((field) => {
      const value = values[field.key];
      if (value === '' || value === undefined || (Array.isArray(value) && value.length === 0)) {
        return [];
      }
      return [[field.key, value]];
    }),
  );
}

function initialReview(source: string, localized: AdminServiceDetail['service']['title'] | null) {
  const options = reviewOptions(source, localized);
  return options === undefined ? undefined : createTranslationReview(options);
}

function setAllApproved(review: TranslationReview | undefined): TranslationReview | undefined {
  if (review === undefined) return undefined;
  let next = review;
  approveAll(next, (language) => {
    next = approveTranslation(next, language);
  });
  return next;
}

export function ServiceEditor({ categories, detail, onSaved }: ServiceEditorProps) {
  const { t, i18n } = useTranslation(['services', 'errors']);
  const firstCategory = categories[0];
  const [categoryId, setCategoryId] = useState(
    detail?.service.category_id ?? firstCategory?.id ?? '',
  );
  const category = categories.find((item) => item.id === categoryId) ?? firstCategory;
  const [title, setTitle] = useState(detail?.service.title.ca ?? '');
  const [description, setDescription] = useState(detail?.service.description?.ca ?? '');
  const [titleReview, setTitleReview] = useState(() =>
    initialReview(detail?.service.title.ca ?? '', detail?.service.title ?? null),
  );
  const [descriptionReview, setDescriptionReview] = useState(() =>
    initialReview(detail?.service.description?.ca ?? '', detail?.service.description ?? null),
  );
  const [images, setImages] = useState<ServiceImageDraft[]>(() =>
    (detail?.images ?? []).map((image) => ({
      key: image.id,
      url: image.url,
      file: null,
      alt: image.alt_text.ca,
      review: initialReview(image.alt_text.ca, image.alt_text),
      state: 'stored',
    })),
  );
  const [mode, setMode] = useState<PublishMode>(() => initialMode(detail));
  const [publishedAt, setPublishedAt] = useState(
    localDateTime(detail?.service.published_at ?? null),
  );
  const [expiresAt, setExpiresAt] = useState(localDateTime(detail?.service.expires_at ?? null));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formInvalid, setFormInvalid] = useState(false);
  const [formIssues, setFormIssues] = useState('');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const form = useForm<ServiceFormValues>({
    defaultValues: {
      providerName: detail?.service.provider_name ?? '',
      location: detail?.service.location ?? '',
      zone: detail?.service.zone ?? '',
      costType: detail?.service.cost_type ?? 'free',
      costAmount:
        detail?.service.cost_amount === null || detail === undefined
          ? ''
          : String(detail.service.cost_amount),
      costDetails: detail?.service.cost_details ?? '',
      contactName: detail?.service.contact_name ?? '',
      contactPhone: detail?.service.contact_phone ?? '',
      contactEmail: detail?.service.contact_email ?? '',
      contactRole: detail?.service.contact_role ?? '',
      schedule: detail?.service.schedule ?? '',
      externalUrl: detail?.service.external_url ?? '',
      availability: detail?.service.availability ?? 'available',
      metadata:
        category === undefined ? {} : serviceMetadataDefaults(category, detail?.service.metadata),
    },
  });

  if (category === undefined) {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {t('services:formInvalid')}
      </p>
    );
  }
  const activeCategory = category;

  function changeCategory(nextId: string) {
    setCategoryId(nextId);
    const next = categories.find((item) => item.id === nextId);
    if (next !== undefined) form.setValue('metadata', serviceMetadataDefaults(next));
  }

  function updateImage(key: string, update: (image: ServiceImageDraft) => ServiceImageDraft) {
    setImages((previous) => previous.map((image) => (image.key === key ? update(image) : image)));
  }

  function moveImage(index: number, offset: -1 | 1) {
    const destination = index + offset;
    if (destination < 0 || destination >= images.length) return;
    setImages((previous) => {
      const next = [...previous];
      [next[index], next[destination]] = [next[destination]!, next[index]!];
      return next;
    });
  }

  async function generateTranslations() {
    setErrorCode(null);
    setIsGenerating(true);
    const requests = [
      { key: 'title', source: title },
      ...(description.trim().length > 0 ? [{ key: 'description', source: description }] : []),
      ...images.flatMap((image) =>
        image.alt.trim().length > 0 ? [{ key: image.key, source: image.alt }] : [],
      ),
    ];
    const results = await Promise.all(
      requests.map(async (request) => ({
        ...request,
        result: await requestCatalanTranslation(request.source),
      })),
    );
    const failed = results.find((item) => !item.result.ok);
    if (failed !== undefined && !failed.result.ok) setErrorCode(failed.result.error.code);
    else {
      for (const item of results) {
        if (!item.result.ok) continue;
        if (item.key === 'title') setTitleReview(item.result.value);
        else if (item.key === 'description') setDescriptionReview(item.result.value);
        else {
          const review = item.result.value;
          updateImage(item.key, (image) => ({ ...image, review }));
        }
      }
    }
    setIsGenerating(false);
  }

  function publicationTime(): string | null {
    if (mode === 'draft') return null;
    if (mode === 'scheduled')
      return publishedAt.length === 0 ? null : new Date(publishedAt).toISOString();
    if (
      detail?.service.status === 'published' &&
      detail.service.published_at !== null &&
      new Date(detail.service.published_at).getTime() <= Date.now()
    )
      return detail.service.published_at;
    return new Date().toISOString();
  }

  async function uploadImage(image: ServiceImageDraft): Promise<string> {
    if (image.file === null) {
      if (image.url === null) throw new AppError('UPLOAD-1');
      return image.url;
    }
    if (mediaWorkerUrl.length === 0) throw new AppError('UPLOAD-1');
    const contentType = uploadContentTypeSchema.safeParse(image.file.type);
    if (!contentType.success || !contentType.data.startsWith('image/'))
      throw new AppError('UPLOAD-2');
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session === null) throw new AppError('AUTH-2');
    updateImage(image.key, (current) => ({ ...current, state: 'uploading' }));
    const result = await uploadFile({
      mediaWorkerUrl,
      accessToken: data.session.access_token,
      folder: 'services',
      file: { data: image.file, contentType: contentType.data, byteLength: image.file.size },
      prepareFile: compressBrowserImage,
    });
    if (!result.ok) throw result.error;
    return result.value.objectKey;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    setFormInvalid(false);
    setFormIssues('');
    const publishing = mode !== 'draft';
    if (
      publishing &&
      (titleReview === undefined ||
        !isTranslationReviewPublishable(titleReview) ||
        (description.trim().length > 0 &&
          (descriptionReview === undefined ||
            !isTranslationReviewPublishable(descriptionReview))) ||
        images.some(
          (image) => image.review === undefined || !isTranslationReviewPublishable(image.review),
        ))
    ) {
      setErrorCode('TRANSLATION-4');
      return;
    }
    const values = form.getValues();
    const inputWithoutImages = {
      categoryId: activeCategory.id,
      title: localizedTextFromReview(title, titleReview),
      description:
        description.trim().length === 0
          ? null
          : localizedTextFromReview(description, descriptionReview),
      providerName: blankToNull(values.providerName),
      location: blankToNull(values.location),
      zone: blankToNull(values.zone),
      costType: values.costType,
      costAmount: values.costAmount.trim().length === 0 ? null : Number(values.costAmount),
      costDetails: blankToNull(values.costDetails),
      contactName: blankToNull(values.contactName),
      contactPhone: blankToNull(values.contactPhone),
      contactEmail: blankToNull(values.contactEmail),
      contactRole: blankToNull(values.contactRole),
      schedule: blankToNull(values.schedule),
      externalUrl: blankToNull(values.externalUrl),
      availability: values.availability,
      metadata: normalizedServiceMetadata(activeCategory, values.metadata),
      status: publishing ? ('published' as const) : ('draft' as const),
      publishedAt: publicationTime(),
      expiresAt: publishing && expiresAt.length > 0 ? new Date(expiresAt).toISOString() : null,
    };
    const preview = createAdminServiceInputSchema(activeCategory).safeParse({
      ...inputWithoutImages,
      images: images.map((image) => ({
        url: image.url ?? 'pending-upload',
        altText: localizedTextFromReview(image.alt, image.review),
      })),
    });
    if (!preview.success) {
      setFormInvalid(true);
      setFormIssues(
        preview.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      );
      return;
    }
    setIsSaving(true);
    const result = await safeAsync(
      async () => {
        const urls = await Promise.all(images.map(uploadImage));
        return saveAdminService(
          supabase,
          activeCategory,
          {
            ...inputWithoutImages,
            images: images.map((image, index) => ({
              url: urls[index]!,
              altText: localizedTextFromReview(image.alt, image.review),
            })),
          },
          detail?.service.id ?? null,
        );
      },
      {
        code: 'DB-1',
        context: { operation: detail === undefined ? 'create-service' : 'update-service' },
      },
    );
    setIsSaving(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    await onSaved(result.value);
  }

  const locale = (i18n.resolvedLanguage ?? 'ca') as keyof AdminServiceCategory['name'];
  return (
    <FormProvider {...form}>
      <form className="flex flex-col gap-6 p-6" onSubmit={submit} data-testid="service-editor">
        <h1 className="text-2xl font-semibold">
          {detail === undefined ? t('services:newAction') : t('services:editTitle')}
        </h1>
        <label className="flex max-w-md flex-col gap-2">
          <span className="text-sm font-medium">{t('services:fieldCategory')}</span>
          <select
            required
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="service-category"
            value={categoryId}
            onChange={(event) => changeCategory(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name[locale] ?? item.name.ca}
              </option>
            ))}
          </select>
        </label>
        <MultilingualEditor
          fieldId="service-title"
          sourceLabel={t('services:fieldTitle')}
          sourceValue={title}
          review={titleReview}
          maxLength={300}
          translationNamespace="services"
          onSourceChange={(value) => {
            setTitle(value);
            setTitleReview(undefined);
          }}
          onTranslationChange={(language, value) =>
            setTitleReview((review) =>
              review === undefined ? review : editTranslationDraft(review, language, value),
            )
          }
        />
        <TranslationReviewPanel
          fieldId="service-title"
          review={titleReview}
          translationNamespace="services"
          onApprove={(language) =>
            setTitleReview((review) =>
              review === undefined ? review : approveTranslation(review, language),
            )
          }
          onReject={(language) =>
            setTitleReview((review) =>
              review === undefined ? review : rejectTranslation(review, language),
            )
          }
          onApproveAll={() => setTitleReview(setAllApproved)}
        />
        <MultilingualEditor
          fieldId="service-description"
          sourceLabel={t('services:fieldDescription')}
          sourceValue={description}
          review={descriptionReview}
          maxLength={10_000}
          translationNamespace="services"
          onSourceChange={(value) => {
            setDescription(value);
            setDescriptionReview(undefined);
          }}
          onTranslationChange={(language, value) =>
            setDescriptionReview((review) =>
              review === undefined ? review : editTranslationDraft(review, language, value),
            )
          }
        />
        <TranslationReviewPanel
          fieldId="service-description"
          review={descriptionReview}
          translationNamespace="services"
          onApprove={(language) =>
            setDescriptionReview((review) =>
              review === undefined ? review : approveTranslation(review, language),
            )
          }
          onReject={(language) =>
            setDescriptionReview((review) =>
              review === undefined ? review : rejectTranslation(review, language),
            )
          }
          onApproveAll={() => setDescriptionReview(setAllApproved)}
        />
        <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
          <TextField
            label={t('services:fieldProviderName')}
            testId="service-provider"
            registration={form.register('providerName')}
          />
          <TextField
            label={t('services:fieldLocation')}
            testId="service-location"
            registration={form.register('location')}
          />
          <TextField
            label={t('services:fieldZone')}
            testId="service-zone"
            registration={form.register('zone')}
          />
          <SelectField
            label={t('services:fieldCostType')}
            testId="service-cost-type"
            registration={form.register('costType')}
            options={[
              ['free', t('services:costFree')],
              ['paid', t('services:costPaid')],
              ['subsidized', t('services:costSubsidized')],
              ['varies', t('services:costVaries')],
            ]}
          />
          <TextField
            label={t('services:fieldCostAmount')}
            testId="service-cost-amount"
            type="number"
            registration={form.register('costAmount')}
          />
          <TextField
            label={t('services:fieldCostDetails')}
            testId="service-cost-details"
            registration={form.register('costDetails')}
          />
          <TextField
            label={t('services:fieldContactName')}
            testId="service-contact-name"
            registration={form.register('contactName')}
          />
          <TextField
            label={t('services:fieldContactPhone')}
            testId="service-contact-phone"
            registration={form.register('contactPhone')}
          />
          <TextField
            label={t('services:fieldContactEmail')}
            testId="service-contact-email"
            type="email"
            registration={form.register('contactEmail')}
          />
          <TextField
            label={t('services:fieldContactRole')}
            testId="service-contact-role"
            registration={form.register('contactRole')}
          />
          <TextField
            label={t('services:fieldSchedule')}
            testId="service-schedule"
            registration={form.register('schedule')}
          />
          <TextField
            label={t('services:fieldExternalUrl')}
            testId="service-external-url"
            type="url"
            registration={form.register('externalUrl')}
          />
          <SelectField
            label={t('services:fieldAvailability')}
            testId="service-availability"
            registration={form.register('availability')}
            options={[
              ['available', t('services:availabilityAvailable')],
              ['waiting_list', t('services:availabilityWaitingList')],
              ['by_appointment', t('services:availabilityByAppointment')],
              ['full', t('services:availabilityFull')],
            ]}
          />
        </section>
        <ServiceMetadataFields category={activeCategory.definition} language={locale} />
        <section className="flex flex-col gap-4" data-testid="service-images">
          {images.map((image, index) => (
            <div
              key={image.key}
              className="flex flex-col gap-3 rounded-lg border p-4"
              data-testid={`service-image-${index}`}
            >
              <ImageUploadField
                fieldId={`service-${index}`}
                state={image.state}
                translationNamespace="services"
                onSelect={(file) =>
                  updateImage(image.key, (current) => ({ ...current, file, state: 'ready' }))
                }
                onRemove={() =>
                  setImages((previous) => previous.filter((item) => item.key !== image.key))
                }
              />
              <MultilingualEditor
                fieldId={`service-image-alt-${index}`}
                sourceLabel={t('services:imageAlt')}
                sourceValue={image.alt}
                review={image.review}
                maxLength={500}
                translationNamespace="services"
                onSourceChange={(value) =>
                  updateImage(image.key, (current) => ({
                    ...current,
                    alt: value,
                    review: undefined,
                  }))
                }
                onTranslationChange={(language, value) =>
                  updateImage(image.key, (current) => ({
                    ...current,
                    review:
                      current.review === undefined
                        ? undefined
                        : editTranslationDraft(current.review, language, value),
                  }))
                }
              />
              <TranslationReviewPanel
                fieldId={`service-image-alt-${index}`}
                review={image.review}
                translationNamespace="services"
                onApprove={(language) =>
                  updateImage(image.key, (current) => ({
                    ...current,
                    review:
                      current.review === undefined
                        ? undefined
                        : approveTranslation(current.review, language),
                  }))
                }
                onReject={(language) =>
                  updateImage(image.key, (current) => ({
                    ...current,
                    review:
                      current.review === undefined
                        ? undefined
                        : rejectTranslation(current.review, language),
                  }))
                }
                onApproveAll={() =>
                  updateImage(image.key, (current) => ({
                    ...current,
                    review: setAllApproved(current.review),
                  }))
                }
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={index === 0}
                  data-testid={`service-image-up-${index}`}
                  onClick={() => moveImage(index, -1)}
                >
                  {t('services:imageMoveUp')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={index === images.length - 1}
                  data-testid={`service-image-down-${index}`}
                  onClick={() => moveImage(index, 1)}
                >
                  {t('services:imageMoveDown')}
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            data-testid="service-image-add"
            disabled={images.length >= 12}
            onClick={() =>
              setImages((previous) => [
                ...previous,
                {
                  key: crypto.randomUUID(),
                  url: null,
                  file: null,
                  alt: '',
                  review: undefined,
                  state: 'empty',
                },
              ])
            }
          >
            {t('services:imageAdd')}
          </Button>
        </section>
        <Button
          type="button"
          variant="secondary"
          data-testid="service-generate-translations"
          disabled={
            isGenerating ||
            title.trim().length === 0 ||
            images.some((image) => image.alt.trim().length === 0)
          }
          onClick={() => void generateTranslations()}
        >
          {isGenerating ? t('services:generatingTranslations') : t('services:generateTranslations')}
        </Button>
        <ScheduledPublishFields
          fieldId="service"
          mode={mode}
          publishedAt={publishedAt}
          expiresAt={expiresAt}
          translationNamespace="services"
          onModeChange={setMode}
          onPublishedAtChange={setPublishedAt}
          onExpiresAtChange={setExpiresAt}
        />
        {formInvalid ? (
          <p role="alert" className="text-sm text-destructive" data-testid="service-form-error">
            {t('services:formInvalid')} {formIssues}
          </p>
        ) : null}
        {errorCode === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors:${errorCode}`)}
          </p>
        )}
        <Button type="submit" size="lg" data-testid="service-save" disabled={isSaving}>
          {isSaving ? t('services:saving') : t('services:save')}
        </Button>
      </form>
    </FormProvider>
  );
}

function TextField({
  label,
  testId,
  type = 'text',
  registration,
}: {
  readonly label: string;
  readonly testId: string;
  readonly type?: string;
  readonly registration: ReturnType<ReturnType<typeof useForm<ServiceFormValues>>['register']>;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Input type={type} data-testid={testId} {...registration} />
    </label>
  );
}

function SelectField({
  label,
  testId,
  registration,
  options,
}: {
  readonly label: string;
  readonly testId: string;
  readonly registration: ReturnType<ReturnType<typeof useForm<ServiceFormValues>>['register']>;
  readonly options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        data-testid={testId}
        {...registration}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
