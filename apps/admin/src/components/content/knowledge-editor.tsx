import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { requestCatalanTranslation } from '@/lib/translation-worker';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import { useAuth } from '@ramassa/shared/auth';
import { AppError, type AppErrorCode } from '@ramassa/shared/errors';
import { type SupportedLanguage } from '@ramassa/shared/i18n';
import { compressBrowserImage } from '@ramassa/shared/image-compression';
import {
  createKnowledgeArticle,
  KNOWLEDGE_CONTENT_TYPES,
  knowledgeArticleInputSchema,
  MAX_KNOWLEDGE_TITLE_LENGTH,
  normalizeVideoEmbedUrl,
  transitionParticipantStory,
  updateKnowledgeArticle,
  type KnowledgeArticleListRow,
  type KnowledgeCategoryRow,
  type KnowledgeContentType,
  type LocalizedKnowledgeBody,
  type StoryStatus,
} from '@ramassa/shared/knowledge';
import { uploadContentTypeSchema } from '@ramassa/shared/schemas';
import {
  isTranslationReviewPublishable,
  type CreateTranslationReviewOptions,
  type TranslationReview,
} from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';
import { uploadFile } from '@ramassa/shared/upload-client';
import { KnowledgeBodyEditor } from './knowledge-body-editor';
import {
  applyStepImageUrls,
  localDateTime,
  nextStoryPublicationState,
  translateKnowledgeBody,
} from './knowledge-editor-helpers';
import { MultilingualEditor } from './multilingual-editor';
import { ScheduledPublishFields, type PublishMode } from './scheduled-publish-fields';
import { StructuredContentRenderer } from './structured-content-renderer';
import { TranslationReviewPanel } from './translation-review-panel';

const TARGET_LANGUAGES = ['es', 'en', 'ar', 'fa'] as const;
const STAFF_CONTENT_TYPES = KNOWLEDGE_CONTENT_TYPES.filter(
  (type): type is Exclude<KnowledgeContentType, 'participant_story'> =>
    type !== 'participant_story',
);

export interface KnowledgeEditorProps {
  readonly article?: KnowledgeArticleListRow;
  readonly categories: readonly KnowledgeCategoryRow[];
  readonly onSaved: () => void | Promise<void>;
}

function reviewOptions(
  article: KnowledgeArticleListRow | undefined,
): CreateTranslationReviewOptions | undefined {
  if (article === undefined) return undefined;
  const translations = Object.fromEntries(
    TARGET_LANGUAGES.flatMap((language) => {
      const text = article.title[language];
      return text === undefined ? [] : [[language, text]];
    }),
  );
  return Object.keys(translations).length === 0
    ? undefined
    : { sourceLanguage: 'ca', sourceText: article.title.ca, translations };
}

function approveAll(
  review: TranslationReview | undefined,
  approve: (language: SupportedLanguage) => void,
) {
  for (const suggestion of review?.suggestions ?? []) approve(suggestion.language);
}

function initialMode(article: KnowledgeArticleListRow | undefined): PublishMode {
  if (article?.is_published !== true) return 'draft';
  return article.published_at !== null && new Date(article.published_at).getTime() > Date.now()
    ? 'scheduled'
    : 'now';
}

export function KnowledgeEditor({ article, categories, onSaved }: KnowledgeEditorProps) {
  const { t } = useTranslation(['knowledge', 'errors']);
  const { session } = useAuth();
  const [categoryId, setCategoryId] = useState(article?.category_id ?? categories[0]?.id ?? '');
  const [contentType, setContentType] = useState<KnowledgeContentType>(
    article?.content_type ?? 'article',
  );
  const [title, setTitle] = useState(article?.title.ca ?? '');
  const [body, setBody] = useState<LocalizedKnowledgeBody>(
    article?.body ?? { ca: [{ type: 'paragraph', text: '' }] },
  );
  const [approvedBodyLanguages, setApprovedBodyLanguages] = useState<Set<SupportedLanguage>>(
    () => new Set(TARGET_LANGUAGES.filter((language) => article?.body[language] !== undefined)),
  );
  const [stepFiles, setStepFiles] = useState<Record<number, File>>({});
  const [videoUrl, setVideoUrl] = useState(article?.video_url ?? '');
  const [externalUrl, setExternalUrl] = useState(article?.external_url ?? '');
  const [reviewerNote, setReviewerNote] = useState(article?.reviewer_note ?? '');
  const [mode, setMode] = useState<PublishMode>(() => initialMode(article));
  const [publishedAt, setPublishedAt] = useState(localDateTime(article?.published_at ?? null));
  const [expiresAt, setExpiresAt] = useState(localDateTime(article?.expires_at ?? null));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const titleReview = useTranslationReview(reviewOptions(article));

  async function generateTranslations() {
    setIsGenerating(true);
    setErrorCode(null);
    const result = await safeAsync(
      async () => {
        const [titleResult, translatedBody] = await Promise.all([
          requestCatalanTranslation(title),
          translateKnowledgeBody(body.ca),
        ]);
        if (!titleResult.ok) throw titleResult.error;
        titleReview.start({
          sourceLanguage: 'ca',
          sourceText: title,
          translations: Object.fromEntries(
            titleResult.value.suggestions.map((suggestion) => [
              suggestion.language,
              suggestion.machineText,
            ]),
          ),
        });
        setBody(translatedBody);
        setApprovedBodyLanguages(new Set());
      },
      { code: 'TRANSLATION-1', context: { operation: 'translate-knowledge-resource' } },
    );
    if (!result.ok) setErrorCode(result.error.code);
    setIsGenerating(false);
  }

  async function uploadStepImages(): Promise<LocalizedKnowledgeBody> {
    const pending = Object.entries(stepFiles);
    if (pending.length === 0) return body;
    if (mediaWorkerUrl.length === 0) throw new AppError('UPLOAD-1');
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session === null) throw new AppError('AUTH-2');
    const uploaded = await Promise.all(
      pending.map(async ([rawIndex, file]) => {
        const contentType = uploadContentTypeSchema.safeParse(file.type);
        if (!contentType.success || !contentType.data.startsWith('image/')) {
          throw new AppError('UPLOAD-2');
        }
        const result = await uploadFile({
          mediaWorkerUrl,
          accessToken: data.session!.access_token,
          folder: 'knowledge-base',
          file: { data: file, contentType: contentType.data, byteLength: file.size },
          prepareFile: compressBrowserImage,
        });
        if (!result.ok) throw result.error;
        return [Number(rawIndex), result.value.objectKey] as const;
      }),
    );
    return applyStepImageUrls(body, Object.fromEntries(uploaded));
  }

  function publicationTime(): string | null {
    if (mode === 'draft') return null;
    if (mode === 'scheduled') return publishedAt ? new Date(publishedAt).toISOString() : null;
    if (article?.is_published && article.published_at !== null) return article.published_at;
    return new Date().toISOString();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    const publishing = mode !== 'draft';
    if (
      publishing &&
      (titleReview.review === undefined ||
        !isTranslationReviewPublishable(titleReview.review) ||
        !TARGET_LANGUAGES.every((language) => approvedBodyLanguages.has(language)))
    ) {
      setErrorCode('TRANSLATION-4');
      return;
    }

    setIsSaving(true);
    const result = await safeAsync(
      async () => {
        const storedBody = await uploadStepImages();
        const input = {
          categoryId,
          title: localizedTextFromReview(title, titleReview.review),
          body: storedBody,
          imageUrl: article?.image_url ?? null,
          videoUrl: videoUrl.trim() || null,
          externalUrl: externalUrl.trim() || null,
          contentType,
          storyStatus: nextStoryPublicationState(article?.story_status ?? null, publishing),
          authorId: article?.author_id ?? null,
          reviewerNote:
            article?.content_type === 'participant_story' ? reviewerNote.trim() || null : null,
          isPublished: publishing,
          publishedAt: publicationTime(),
          expiresAt: publishing && expiresAt ? new Date(expiresAt).toISOString() : null,
        };
        const parsed = knowledgeArticleInputSchema.safeParse(input);
        if (!parsed.success) throw new AppError('VALIDATION-1');
        if (article === undefined) await createKnowledgeArticle(supabase, parsed.data);
        else await updateKnowledgeArticle(supabase, article.id, parsed.data);
        await onSaved();
      },
      {
        code: 'DB-1',
        context: { operation: article === undefined ? 'create-knowledge' : 'update-knowledge' },
      },
    );
    if (!result.ok) setErrorCode(result.error.code);
    setIsSaving(false);
  }

  async function completeStoryReview(
    status: Extract<StoryStatus, 'changes_requested' | 'rejected'>,
  ) {
    if (article?.story_status !== 'in_review') return;
    setIsSaving(true);
    const result = await safeAsync(
      async () => {
        await transitionParticipantStory(
          supabase,
          article.id,
          'in_review',
          status,
          reviewerNote.trim() || null,
        );
        await onSaved();
      },
      { code: 'DB-1', context: { operation: `story-${status}` } },
    );
    if (!result.ok) setErrorCode(result.error.code);
    setIsSaving(false);
  }

  const normalizedVideo = videoUrl.trim() ? normalizeVideoEmbedUrl(videoUrl) : null;
  return (
    <form className="flex flex-col gap-6 p-6" onSubmit={submit} data-testid="knowledge-editor">
      <h1 className="text-2xl font-semibold">
        {article === undefined ? t('knowledge:newAction') : t('knowledge:editTitle')}
      </h1>
      <KnowledgeMetadataFields
        categories={categories}
        categoryId={categoryId}
        contentType={contentType}
        isParticipantStory={article?.content_type === 'participant_story'}
        videoUrl={videoUrl}
        externalUrl={externalUrl}
        onCategoryChange={setCategoryId}
        onContentTypeChange={setContentType}
        onVideoUrlChange={setVideoUrl}
        onExternalUrlChange={setExternalUrl}
      />
      <MultilingualEditor
        fieldId="knowledge-title"
        sourceLabel={t('knowledge:fieldTitle')}
        sourceValue={title}
        review={titleReview.review}
        maxLength={MAX_KNOWLEDGE_TITLE_LENGTH}
        translationNamespace="knowledge"
        onSourceChange={(value) => {
          setTitle(value);
          titleReview.reset();
        }}
        onTranslationChange={titleReview.edit}
      />
      <TranslationReviewPanel
        fieldId="knowledge-title"
        review={titleReview.review}
        translationNamespace="knowledge"
        onApprove={titleReview.approve}
        onReject={titleReview.reject}
        onApproveAll={() => approveAll(titleReview.review, titleReview.approve)}
      />
      <KnowledgeBodyEditor
        body={body}
        approvedLanguages={approvedBodyLanguages}
        stepImageNames={Object.fromEntries(
          Object.entries(stepFiles).map(([index, file]) => [index, file.name]),
        )}
        onSourceChange={(blocks) => {
          setBody({ ca: blocks });
          setApprovedBodyLanguages(new Set());
        }}
        onTranslationChange={(language, blocks) => {
          setBody((current) => ({ ...current, [language]: blocks }));
          setApprovedBodyLanguages((current) => {
            const next = new Set(current);
            next.delete(language);
            return next;
          });
        }}
        onStepImageSelect={(index, file) =>
          setStepFiles((current) => ({ ...current, [index]: file }))
        }
        onApprove={(language) =>
          setApprovedBodyLanguages((current) => new Set(current).add(language))
        }
      />
      <Button
        type="button"
        size="lg"
        variant="secondary"
        data-testid="knowledge-generate"
        disabled={!title.trim() || isGenerating}
        onClick={() => void generateTranslations()}
      >
        {isGenerating ? t('knowledge:generatingTranslations') : t('knowledge:generateTranslations')}
      </Button>
      <StructuredContentRenderer
        title={title}
        blocks={body.ca}
        videoUrl={normalizedVideo}
        mediaWorkerUrl={mediaWorkerUrl}
        accessToken={session?.access_token}
      />
      {article?.content_type === 'participant_story' ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('knowledge:reviewerNote')}</span>
          <Textarea
            data-testid="knowledge-reviewer-note"
            value={reviewerNote}
            onChange={(event) => setReviewerNote(event.target.value)}
          />
        </label>
      ) : null}
      <ScheduledPublishFields
        fieldId="knowledge"
        translationNamespace="knowledge"
        mode={mode}
        publishedAt={publishedAt}
        expiresAt={expiresAt}
        onModeChange={setMode}
        onPublishedAtChange={setPublishedAt}
        onExpiresAtChange={setExpiresAt}
      />
      {errorCode === null ? null : (
        <p role="alert" data-testid="knowledge-form-error" className="text-sm text-destructive">
          {errorCode === 'TRANSLATION-4'
            ? t('knowledge:translationRequired')
            : t(`errors:${errorCode}`)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" data-testid="knowledge-save" disabled={isSaving}>
          {mode === 'draft'
            ? t('knowledge:saveDraft')
            : article === undefined
              ? t('knowledge:publish')
              : t('knowledge:update')}
        </Button>
        {article?.story_status === 'in_review' ? (
          <>
            <Button
              type="button"
              variant="outline"
              data-testid="knowledge-request-changes"
              disabled={isSaving}
              onClick={() => void completeStoryReview('changes_requested')}
            >
              {t('knowledge:requestChanges')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="bg-destructive text-white hover:bg-destructive/90"
              data-testid="knowledge-decline"
              disabled={isSaving}
              onClick={() => void completeStoryReview('rejected')}
            >
              {t('knowledge:decline')}
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}

interface KnowledgeMetadataFieldsProps {
  readonly categories: readonly KnowledgeCategoryRow[];
  readonly categoryId: string;
  readonly contentType: KnowledgeContentType;
  readonly isParticipantStory: boolean;
  readonly videoUrl: string;
  readonly externalUrl: string;
  readonly onCategoryChange: (value: string) => void;
  readonly onContentTypeChange: (value: KnowledgeContentType) => void;
  readonly onVideoUrlChange: (value: string) => void;
  readonly onExternalUrlChange: (value: string) => void;
}

function KnowledgeMetadataFields(props: KnowledgeMetadataFieldsProps) {
  const { t } = useTranslation('knowledge');
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('fieldCategory')}</span>
        <select
          className="h-9 rounded-md border bg-background px-3"
          data-testid="knowledge-category"
          value={props.categoryId}
          onChange={(event) => props.onCategoryChange(event.target.value)}
        >
          {props.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name.ca}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('fieldContentType')}</span>
        <select
          className="h-9 rounded-md border bg-background px-3"
          data-testid="knowledge-content-type"
          value={props.contentType}
          disabled={props.isParticipantStory}
          onChange={(event) =>
            props.onContentTypeChange(event.target.value as KnowledgeContentType)
          }
        >
          {(props.isParticipantStory ? (['participant_story'] as const) : STAFF_CONTENT_TYPES).map(
            (type) => (
              <option key={type} value={type}>
                {t(
                  `type${type
                    .split('_')
                    .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
                    .join('')}`,
                )}
              </option>
            ),
          )}
        </select>
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('fieldVideo')}</span>
        <Input
          data-testid="knowledge-video-url"
          value={props.videoUrl}
          onChange={(event) => props.onVideoUrlChange(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('fieldExternal')}</span>
        <Input
          data-testid="knowledge-external-url"
          value={props.externalUrl}
          onChange={(event) => props.onExternalUrlChange(event.target.value)}
        />
      </label>
    </section>
  );
}
