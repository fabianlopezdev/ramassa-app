import { Button } from '@/components/ui/button';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { requestCatalanTranslation } from '@/lib/translation-worker';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ANNOUNCEMENT_CATEGORIES,
  areAnnouncementTranslationsApproved,
  createAnnouncement,
  localizedTextFromReview,
  MAX_ANNOUNCEMENT_ALT_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
  updateAnnouncement,
  type AnnouncementCategory,
  type AnnouncementListRow,
} from '@ramassa/shared/announcements';
import { AppError, type AppErrorCode } from '@ramassa/shared/errors';
import { type SupportedLanguage } from '@ramassa/shared/i18n';
import { compressBrowserImage } from '@ramassa/shared/image-compression';
import { uploadContentTypeSchema } from '@ramassa/shared/schemas';
import {
  MAX_TRANSLATION_TEXT_LENGTH,
  type CreateTranslationReviewOptions,
  type TranslationReview,
} from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';
import { uploadFile } from '@ramassa/shared/upload-client';
import { ImageUploadField, type ImageUploadState } from './image-upload-field';
import { MultilingualEditor } from './multilingual-editor';
import { ScheduledPublishFields, type PublishMode } from './scheduled-publish-fields';
import { TranslationReviewPanel } from './translation-review-panel';

const TARGET_LANGUAGES = ['es', 'en', 'ar', 'fa'] as const;

export interface AnnouncementEditorProps {
  readonly announcement?: AnnouncementListRow;
  readonly onSaved: (announcement: AnnouncementListRow) => void | Promise<void>;
}

function reviewOptions(
  sourceText: string,
  localized: AnnouncementListRow['title'] | null,
): CreateTranslationReviewOptions | undefined {
  if (localized === null) return undefined;
  const translations = Object.fromEntries(
    TARGET_LANGUAGES.flatMap((language) => {
      const text = localized[language];
      return typeof text === 'string' && text.length > 0 ? [[language, text]] : [];
    }),
  );
  if (Object.keys(translations).length === 0) return undefined;
  return { sourceLanguage: 'ca', sourceText, translations };
}

function localDateTime(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialMode(announcement: AnnouncementListRow | undefined): PublishMode {
  if (announcement === undefined || announcement.status === 'draft') return 'draft';
  if (
    announcement.published_at !== null &&
    new Date(announcement.published_at).getTime() > Date.now()
  ) {
    return 'scheduled';
  }
  return 'now';
}

function startGeneratedReview(
  generated: TranslationReview,
  start: (options: CreateTranslationReviewOptions) => void,
) {
  start({
    sourceLanguage: generated.sourceLanguage,
    sourceText: generated.sourceText,
    translations: Object.fromEntries(
      generated.suggestions.map((suggestion) => [suggestion.language, suggestion.machineText]),
    ),
  });
}

function approveAll(
  review: TranslationReview | undefined,
  approve: (language: SupportedLanguage) => void,
) {
  for (const suggestion of review?.suggestions ?? []) approve(suggestion.language);
}

export function AnnouncementEditor({ announcement, onSaved }: AnnouncementEditorProps) {
  const { t } = useTranslation(['announcements', 'errors']);
  const [category, setCategory] = useState<AnnouncementCategory>(announcement?.category ?? 'info');
  const [title, setTitle] = useState(announcement?.title.ca ?? '');
  const [body, setBody] = useState(announcement?.body.ca ?? '');
  const [imageAlt, setImageAlt] = useState(announcement?.image_alt?.ca ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(announcement?.image_url ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageState, setImageState] = useState<ImageUploadState>(
    announcement?.image_url === null || announcement === undefined ? 'empty' : 'stored',
  );
  const [isPinned, setIsPinned] = useState(announcement?.is_pinned ?? false);
  const [mode, setMode] = useState<PublishMode>(() => initialMode(announcement));
  const [publishedAt, setPublishedAt] = useState(localDateTime(announcement?.published_at ?? null));
  const [expiresAt, setExpiresAt] = useState(localDateTime(announcement?.expires_at ?? null));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  const titleReview = useTranslationReview(reviewOptions(title, announcement?.title ?? null));
  const bodyReview = useTranslationReview(reviewOptions(body, announcement?.body ?? null));
  const imageAltReview = useTranslationReview(
    reviewOptions(imageAlt, announcement?.image_alt ?? null),
  );
  const hasImage = imageFile !== null || imageUrl !== null;

  async function generateTranslations() {
    setErrorCode(null);
    setIsGenerating(true);
    const requests = [
      { source: title, start: titleReview.start },
      { source: body, start: bodyReview.start },
      ...(hasImage ? [{ source: imageAlt, start: imageAltReview.start }] : []),
    ];
    const results = await Promise.all(
      requests.map(async ({ source, start }) => ({
        result: await requestCatalanTranslation(source),
        start,
      })),
    );
    const failed = results.find(({ result }) => !result.ok);
    if (failed !== undefined && !failed.result.ok) {
      setErrorCode(failed.result.error.code);
    } else {
      for (const item of results) {
        if (item.result.ok) startGeneratedReview(item.result.value, item.start);
      }
    }
    setIsGenerating(false);
  }

  function publicationTime(): string | null {
    if (mode === 'draft') return null;
    if (mode === 'scheduled')
      return publishedAt.length > 0 ? new Date(publishedAt).toISOString() : null;
    if (
      announcement?.status === 'published' &&
      announcement.published_at !== null &&
      new Date(announcement.published_at).getTime() <= Date.now()
    ) {
      return announcement.published_at;
    }
    return new Date().toISOString();
  }

  async function uploadSelectedImage(): Promise<string | null> {
    if (imageFile === null) return imageUrl;
    if (mediaWorkerUrl.length === 0) throw new AppError('UPLOAD-1');
    const contentType = uploadContentTypeSchema.safeParse(imageFile.type);
    if (!contentType.success || !contentType.data.startsWith('image/')) {
      throw new AppError('UPLOAD-2');
    }
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session === null) throw new AppError('AUTH-2');

    setImageState('uploading');
    const result = await uploadFile({
      mediaWorkerUrl,
      accessToken: data.session.access_token,
      folder: 'announcements',
      file: {
        data: imageFile,
        contentType: contentType.data,
        byteLength: imageFile.size,
      },
      prepareFile: compressBrowserImage,
    });
    if (!result.ok) throw result.error;
    setImageState('stored');
    setImageUrl(result.value.objectKey);
    return result.value.objectKey;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    const publishing = mode !== 'draft';
    if (
      publishing &&
      !areAnnouncementTranslationsApproved({
        titleReview: titleReview.review,
        bodyReview: bodyReview.review,
        imageAltReview: hasImage ? imageAltReview.review : undefined,
      })
    ) {
      setErrorCode('TRANSLATION-4');
      return;
    }

    setIsSaving(true);
    const result = await safeAsync(
      async () => {
        const storedImageUrl = await uploadSelectedImage();
        const input = {
          category,
          title: localizedTextFromReview(title, titleReview.review),
          body: localizedTextFromReview(body, bodyReview.review),
          imageUrl: storedImageUrl,
          imageAlt:
            storedImageUrl === null
              ? null
              : localizedTextFromReview(imageAlt, imageAltReview.review),
          isPinned,
          status: publishing ? ('published' as const) : ('draft' as const),
          publishedAt: publicationTime(),
          expiresAt: publishing && expiresAt.length > 0 ? new Date(expiresAt).toISOString() : null,
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
      if (imageFile !== null) setImageState('ready');
      return;
    }
    const navigation = await safeAsync(() => onSaved(result.value), {
      code: 'UNEXPECTED-1',
      context: { operation: 'navigate-after-announcement-save' },
    });
    if (!navigation.ok) setErrorCode(navigation.error.code);
  }

  const canGenerate =
    title.trim().length > 0 && body.trim().length > 0 && (!hasImage || imageAlt.trim().length > 0);

  return (
    <form className="flex flex-col gap-6 p-6" onSubmit={submit} data-testid="announcement-editor">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {announcement === undefined ? t('announcements:newAction') : t('announcements:editTitle')}
        </h1>
      </header>

      <label className="flex max-w-sm flex-col gap-2">
        <span className="text-sm font-medium">{t('announcements:fieldCategory')}</span>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          data-testid="announcement-category"
          value={category}
          onChange={(event) => setCategory(event.target.value as AnnouncementCategory)}
        >
          {ANNOUNCEMENT_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {t(`announcements:category${capitalize(value)}`)}
            </option>
          ))}
        </select>
      </label>

      <MultilingualEditor
        fieldId="title"
        sourceLabel={t('announcements:fieldTitle')}
        sourceValue={title}
        review={titleReview.review}
        maxLength={MAX_ANNOUNCEMENT_TITLE_LENGTH}
        onSourceChange={(value) => {
          setTitle(value);
          titleReview.reset();
        }}
        onTranslationChange={titleReview.edit}
      />
      <TranslationReviewPanel
        fieldId="title"
        review={titleReview.review}
        onApprove={titleReview.approve}
        onReject={titleReview.reject}
        onApproveAll={() => approveAll(titleReview.review, titleReview.approve)}
      />

      <MultilingualEditor
        fieldId="body"
        sourceLabel={t('announcements:fieldBody')}
        sourceValue={body}
        review={bodyReview.review}
        maxLength={MAX_TRANSLATION_TEXT_LENGTH}
        onSourceChange={(value) => {
          setBody(value);
          bodyReview.reset();
        }}
        onTranslationChange={bodyReview.edit}
      />
      <TranslationReviewPanel
        fieldId="body"
        review={bodyReview.review}
        onApprove={bodyReview.approve}
        onReject={bodyReview.reject}
        onApproveAll={() => approveAll(bodyReview.review, bodyReview.approve)}
      />

      <ImageUploadField
        state={imageState}
        onSelect={(file) => {
          setImageFile(file);
          setImageState('ready');
          imageAltReview.reset();
        }}
        onRemove={() => {
          setImageFile(null);
          setImageUrl(null);
          setImageState('empty');
          setImageAlt('');
          imageAltReview.reset();
        }}
      />

      {hasImage ? (
        <>
          <MultilingualEditor
            fieldId="image-alt"
            sourceLabel={t('announcements:fieldImageAlt')}
            sourceValue={imageAlt}
            review={imageAltReview.review}
            maxLength={MAX_ANNOUNCEMENT_ALT_LENGTH}
            onSourceChange={(value) => {
              setImageAlt(value);
              imageAltReview.reset();
            }}
            onTranslationChange={imageAltReview.edit}
          />
          <TranslationReviewPanel
            fieldId="image-alt"
            review={imageAltReview.review}
            onApprove={imageAltReview.approve}
            onReject={imageAltReview.reject}
            onApproveAll={() => approveAll(imageAltReview.review, imageAltReview.approve)}
          />
        </>
      ) : null}

      <Button
        type="button"
        size="lg"
        variant="secondary"
        data-testid="announcement-generate"
        disabled={!canGenerate || isGenerating}
        onClick={() => void generateTranslations()}
      >
        {isGenerating
          ? t('announcements:generatingTranslations')
          : t('announcements:generateTranslations')}
      </Button>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          data-testid="announcement-pinned"
          checked={isPinned}
          onChange={(event) => setIsPinned(event.target.checked)}
        />
        <span className="text-sm font-medium">{t('announcements:fieldPinned')}</span>
      </label>

      <ScheduledPublishFields
        mode={mode}
        publishedAt={publishedAt}
        expiresAt={expiresAt}
        onModeChange={setMode}
        onPublishedAtChange={setPublishedAt}
        onExpiresAtChange={setExpiresAt}
      />

      {errorCode === 'TRANSLATION-4' ? (
        <p role="alert" className="text-sm text-destructive">
          {hasImage && imageAltReview.review === undefined
            ? t('announcements:imageAltRequired')
            : t('announcements:translationRequired')}
        </p>
      ) : null}
      {errorCode !== null && errorCode !== 'TRANSLATION-4' ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors:${errorCode}`)}
        </p>
      ) : null}

      <Button type="submit" size="lg" data-testid="announcement-save" disabled={isSaving}>
        {mode === 'draft'
          ? t('announcements:saveDraft')
          : announcement === undefined
            ? t('announcements:publish')
            : t('announcements:update')}
      </Button>
    </form>
  );
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
