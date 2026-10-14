/**
 * Writing a knowledge resource on the phone (RAPP-343), with the web admin's
 * fields and rules: category, content type, the title and the block body in
 * the source language (Catalan, or a story's own language), video and
 * external links, the reviewer's note on a story, and the publication.
 * "Generate translations" drafts the title and every block in the four other
 * languages; publishing needs the title drafts and every translated body
 * approved. A story in review can also be returned for changes or declined,
 * with the note.
 *
 * The form is kept on the device while she writes (`knowledge-draft.ts`); a
 * chosen step photo is not kept, as it is uploaded only at save. Without
 * `knowledge.publish` the publication is shown and kept as it is.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { DateTimeField } from '@/components/content/date-time-field';
import {
  KnowledgeBlockSheet,
  type StepPhotoChange,
} from '@/components/content/knowledge-block-sheet';
import {
  KnowledgeSourceBlocks,
  KnowledgeTranslatedBodies,
} from '@/components/content/knowledge-body-editor';
import { KNOWLEDGE_TYPE_KEYS } from '@/components/content/knowledge-labels';
import { MultilingualField } from '@/components/content/multilingual-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { PUBLISH_MODES } from '@/lib/announcement-draft';
import {
  contentKnowledgeRoot,
  useContentKnowledgeArticle,
  useContentKnowledgeCategories,
} from '@/lib/content-knowledge';
import { reviewHandlers, reviewOptions, reviewTexts } from '@/lib/content-translations';
import { uploadContentImage, type PickedPhoto } from '@/lib/content-upload';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import {
  areKnowledgeTranslationsApproved,
  clearKnowledgeDraft,
  completeSourceBlocks,
  emptyBlock,
  generatedBody,
  initialKnowledgeMode,
  isKnowledgePublishing,
  knowledgeSourceLanguage,
  knowledgeTargetLanguages,
  moveBlock,
  movePendingImages,
  PENDING_IMAGE,
  readKnowledgeDraft,
  removeBlock,
  removePendingImage,
  startingKnowledgeDraft,
  toKnowledgeInput,
  withSourceBlocks,
  withTranslatedBlocks,
  writeKnowledgeDraft,
  type FormBlock,
  type FormBlockType,
  type KnowledgeDraft,
} from '@/lib/knowledge-draft';
import { safeAsync } from '@/lib/observability';
import { privateStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { generateDrafts, translateText } from '@/lib/translation-worker';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import {
  AppError,
  getErrorMessageKey,
  toAppError,
  type AppErrorCode,
} from '@ramassa/shared/errors';
import { LANGUAGE_NATIVE_NAMES } from '@ramassa/shared/i18n';
import {
  createKnowledgeArticle,
  KNOWLEDGE_CONTENT_TYPES,
  knowledgeArticleInputSchema,
  MAX_KNOWLEDGE_REVIEWER_NOTE_LENGTH,
  MAX_KNOWLEDGE_TITLE_LENGTH,
  transitionParticipantStory,
  translateKnowledgeBody,
  updateKnowledgeArticle,
  type KnowledgeArticleListRow,
  type KnowledgeCategoryRow,
} from '@ramassa/shared/knowledge';
import { useTranslationReview } from '@ramassa/shared/translation/react';

const MODE_KEYS = { draft: 'modeDraft', now: 'modeNow', scheduled: 'modeScheduled' } as const;
const STAFF_TYPES = KNOWLEDGE_CONTENT_TYPES.filter((type) => type !== 'participant_story');

type FormError = AppErrorCode | 'invalid';

function SectionLabel({ children }: { readonly children: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
      {children}
    </Text>
  );
}

function KnowledgeForm({
  articleId,
  article,
  categories,
}: {
  readonly articleId: string;
  readonly article: KnowledgeArticleListRow | undefined;
  readonly categories: readonly KnowledgeCategoryRow[];
}) {
  const { t } = useTranslation('knowledge');
  const { t: tAnnouncements } = useTranslation('announcements');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const canPublish = useAccountAccess().permissions.has('knowledge.publish');
  const source = knowledgeSourceLanguage(article);
  const targets = knowledgeTargetLanguages(source);
  const isStory = article?.content_type === 'participant_story';
  const [restored] = useState(() => readKnowledgeDraft(privateStorage, userId, articleId));
  const [form, setForm] = useState<KnowledgeDraft>(
    () => restored ?? startingKnowledgeDraft(article, categories[0]?.id ?? ''),
  );
  const [pendingPhotos, setPendingPhotos] = useState<Record<number, PickedPhoto>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  // Saved on the device only once she changes something, so opening a screen
  // and leaving it does not leave a draft behind.
  const [isTouched, setIsTouched] = useState(restored !== null);
  const touch = () => setIsTouched(true);
  const update = (next: (current: KnowledgeDraft) => KnowledgeDraft) => {
    touch();
    setForm(next);
  };
  const set = (patch: Partial<KnowledgeDraft>) => update((current) => ({ ...current, ...patch }));

  const titleReview = useTranslationReview(
    reviewOptions(form.title, restored?.titleTranslations ?? article?.title ?? null),
  );
  const sourceBlocks = form.body[source] ?? [];
  const pendingSet = useMemo(
    () => new Set(Object.keys(pendingPhotos).map(Number)),
    [pendingPhotos],
  );

  useEffect(() => {
    if (userId.length === 0 || !isTouched) return;
    writeKnowledgeDraft(privateStorage, userId, articleId, {
      ...form,
      titleTranslations: reviewTexts(titleReview.review),
    });
  }, [articleId, form, isTouched, titleReview.review, userId]);

  const setSourceBlocks = (blocks: readonly FormBlock[]) =>
    update((current) => withSourceBlocks(current, source, blocks));

  const finishBlock = (block: FormBlock, photo: StepPhotoChange) => {
    const index = editingIndex;
    setEditingIndex(null);
    if (index === null) return;
    if (photo === 'removed') setPendingPhotos((current) => removePendingImage(current, index));
    if (typeof photo === 'object') setPendingPhotos((current) => ({ ...current, [index]: photo }));
    // An unchanged block keeps the translations.
    if (photo === 'kept' && JSON.stringify(block) === JSON.stringify(sourceBlocks[index])) return;
    setSourceBlocks(
      sourceBlocks.map((current, position) => (position === index ? block : current)),
    );
  };
  const addBlock = (type: FormBlockType) => {
    setSourceBlocks([...sourceBlocks, emptyBlock(type)]);
    setEditingIndex(sourceBlocks.length);
  };
  const moveSourceBlock = (index: number, offset: -1 | 1) => {
    setPendingPhotos((current) => movePendingImages(current, sourceBlocks.length, index, offset));
    setSourceBlocks(moveBlock(sourceBlocks, index, offset));
  };
  const removeSourceBlock = (index: number) => {
    setPendingPhotos((current) => removePendingImage(current, index));
    setSourceBlocks(removeBlock(sourceBlocks, index));
  };

  const completeBlocks = completeSourceBlocks(sourceBlocks, pendingSet);
  const canGenerate = form.title.trim().length > 0 && completeBlocks !== null;

  const generate = async () => {
    if (completeBlocks === null) return;
    setError(null);
    touch();
    setIsGenerating(true);
    const [titleFailure, body] = await Promise.all([
      generateDrafts([{ source: form.title, start: titleReview.start }], source),
      safeAsync(() => translateKnowledgeBody(completeBlocks, source, translateText), {
        code: 'TRANSLATION-1',
        context: { operation: 'translate-knowledge-body' },
      }),
    ]);
    setIsGenerating(false);
    if (titleFailure !== null) {
      setError(titleFailure);
      return;
    }
    if (!body.ok) {
      setError(body.error.code);
      return;
    }
    update((current) => ({
      ...current,
      body: generatedBody(body.value, sourceBlocks),
      approvedLanguages: [],
    }));
  };

  const finish = async () => {
    clearKnowledgeDraft(privateStorage, userId, articleId);
    await queryClient.invalidateQueries({ queryKey: contentKnowledgeRoot(userId) });
    playHaptic('success');
    back();
  };

  const save = async () => {
    setError(null);
    if (
      isKnowledgePublishing(form, article, canPublish) &&
      !areKnowledgeTranslationsApproved(form, titleReview.review, source)
    ) {
      setError('TRANSLATION-4');
      playHaptic('warning');
      return;
    }
    const context = { stored: article, canPublish };
    // Checked with stand-ins first, so nothing is uploaded for a form that cannot save.
    const placeholders = Object.fromEntries([...pendingSet].map((index) => [index, PENDING_IMAGE]));
    const checked = safeAsync(
      async () =>
        toKnowledgeInput(form, titleReview.review, { ...context, stepImageUrls: placeholders }),
      { code: 'VALIDATION-1', context: { operation: 'check-knowledge' } },
    );
    const preview = await checked;
    if (!preview.ok) {
      setError(preview.error.code);
      return;
    }
    if (!knowledgeArticleInputSchema.safeParse(preview.value).success) {
      setError('invalid');
      playHaptic('warning');
      return;
    }
    setIsSaving(true);
    const result = await safeAsync(
      async () => {
        const uploaded = await Promise.all(
          Object.entries(pendingPhotos).map(
            async ([index, photo]) =>
              [Number(index), await uploadContentImage('knowledge-base', photo)] as const,
          ),
        );
        const input = toKnowledgeInput(form, titleReview.review, {
          ...context,
          stepImageUrls: Object.fromEntries(uploaded),
        });
        if (!knowledgeArticleInputSchema.safeParse(input).success)
          throw new AppError('VALIDATION-1');
        return article === undefined
          ? createKnowledgeArticle(supabase, input)
          : updateKnowledgeArticle(supabase, article.id, input);
      },
      { code: 'DB-1', context: { operation: article === undefined ? 'create' : 'update' } },
    );
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error.code);
      playHaptic('error');
      return;
    }
    await finish();
  };

  const completeReview = async (to: 'changes_requested' | 'rejected') => {
    if (article?.story_status !== 'in_review') return;
    setError(null);
    setIsSaving(true);
    const result = await safeAsync(
      () =>
        transitionParticipantStory(
          supabase,
          article.id,
          'in_review',
          to,
          form.reviewerNote.trim() || null,
        ),
      { code: 'DB-1', context: { operation: `story-${to}` } },
    );
    setIsSaving(false);
    if (!result.ok) {
      setError(toAppError(result.error).code);
      playHaptic('error');
      return;
    }
    await finish();
  };

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
      title={article === undefined ? t('newAction') : t('editTitle')}
      continueLabel={
        !canPublish || form.mode === 'draft'
          ? article === undefined
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
          testID="knowledge-draft-restored"
          className={`text-start text-sm text-neutral-700 ${fontClass}`}
        >
          {tAnnouncements('draftRestored')}
        </Text>
      )}

      <View className="gap-xs">
        <SectionLabel>{t('fieldCategory')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {categories.map((category) => (
            <ChoiceOption
              key={category.id}
              testID={`knowledge-category-${category.slug}`}
              value={category.id}
              label={category.name.ca ?? category.slug}
              selected={category.id === form.categoryId}
              onSelect={(categoryId) => set({ categoryId })}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>
      <View className="gap-xs">
        <SectionLabel>{t('fieldContentType')}</SectionLabel>
        {isStory ? (
          <Text className={`text-start text-md text-neutral-800 ${fontClass}`}>
            {t('typeParticipantStory')}
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-sm">
            {STAFF_TYPES.map((type) => (
              <ChoiceOption
                key={type}
                testID={`knowledge-type-${type}`}
                value={type}
                label={t(KNOWLEDGE_TYPE_KEYS[type])}
                selected={type === form.contentType}
                onSelect={(contentType) => set({ contentType })}
                languageFontClass={fontClass}
              />
            ))}
          </View>
        )}
      </View>

      <MultilingualField
        testIDPrefix="knowledge-title"
        label={
          isStory
            ? t('fieldSourceTitle', { language: LANGUAGE_NATIVE_NAMES[source] })
            : t('fieldTitle')
        }
        value={form.title}
        onChangeText={(title) => {
          set({ title });
          titleReview.reset();
        }}
        maxLength={MAX_KNOWLEDGE_TITLE_LENGTH}
        {...reviewHandlers(titleReview, touch)}
      />
      <KnowledgeSourceBlocks
        blocks={sourceBlocks}
        pendingPhotos={pendingSet}
        onEdit={setEditingIndex}
        onMove={moveSourceBlock}
        onRemove={removeSourceBlock}
        onAdd={addBlock}
      />
      <PressableScale
        testID="knowledge-generate"
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
      <KnowledgeTranslatedBodies
        body={form.body}
        languages={targets}
        approvedLanguages={form.approvedLanguages}
        onChange={(language, blocks) =>
          update((current) => withTranslatedBlocks(current, language, blocks))
        }
        onApprove={(language) =>
          update((current) => ({
            ...current,
            approvedLanguages: [...new Set([...current.approvedLanguages, language])],
          }))
        }
      />

      <AuthTextField
        testID="knowledge-video-url"
        label={t('fieldVideo')}
        value={form.videoUrl}
        onChangeText={(videoUrl) => set({ videoUrl })}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <AuthTextField
        testID="knowledge-external-url"
        label={t('fieldExternal')}
        value={form.externalUrl}
        onChangeText={(externalUrl) => set({ externalUrl })}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {isStory ? (
        <AuthTextField
          testID="knowledge-reviewer-note"
          label={t('reviewerNote')}
          value={form.reviewerNote}
          onChangeText={(reviewerNote) => set({ reviewerNote })}
          maxLength={MAX_KNOWLEDGE_REVIEWER_NOTE_LENGTH}
          multiline
        />
      ) : null}

      <View className="gap-sm">
        <SectionLabel>{t('modeLabel')}</SectionLabel>
        {canPublish ? (
          <>
            <View className="flex-row flex-wrap gap-sm">
              {PUBLISH_MODES.map((mode) => (
                <ChoiceOption
                  key={mode}
                  testID={`knowledge-mode-${mode}`}
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
                testID="knowledge-published-at"
                label={t('publishedAt')}
                value={form.publishedAt}
                onChange={(publishedAt) => set({ publishedAt })}
              />
            ) : null}
            {form.mode === 'draft' ? null : (
              <DateTimeField
                testID="knowledge-expires-at"
                label={t('expiresAt')}
                value={form.expiresAt}
                onChange={(expiresAt) => set({ expiresAt })}
                emptyLabel={tAnnouncements('noExpiry')}
              />
            )}
          </>
        ) : (
          <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
            {`${t(MODE_KEYS[initialKnowledgeMode(article)])}. ${tAnnouncements('publishLocked')}`}
          </Text>
        )}
      </View>

      {article?.story_status === 'in_review' ? (
        <View className="flex-row flex-wrap gap-sm">
          <PressableScale
            testID="knowledge-request-changes"
            accessibilityRole="button"
            accessibilityLabel={t('requestChanges')}
            onPress={() => void completeReview('changes_requested')}
            isDisabled={isSaving}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-primary bg-white px-lg"
          >
            <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
              {t('requestChanges')}
            </Text>
          </PressableScale>
          <PressableScale
            testID="knowledge-decline"
            accessibilityRole="button"
            accessibilityLabel={t('decline')}
            onPress={() => void completeReview('rejected')}
            isDisabled={isSaving}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-error bg-white px-lg"
          >
            <Text className={`text-center text-md font-bold text-error ${fontClass}`}>
              {t('decline')}
            </Text>
          </PressableScale>
        </View>
      ) : null}

      {error === null || errorMessage === null ? null : (
        <FailureNotice code={error === 'invalid' ? 'VALIDATION-1' : error} message={errorMessage} />
      )}

      <KnowledgeBlockSheet
        block={editingIndex === null ? null : (sourceBlocks[editingIndex] ?? null)}
        language={source}
        hasPendingPhoto={editingIndex !== null && pendingSet.has(editingIndex)}
        onDone={finishBlock}
        onCancel={() => setEditingIndex(null)}
      />
    </WizardFrame>
  );
}

export default function KnowledgeEditScreen() {
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const article = useContentKnowledgeArticle(isNew ? '' : id);
  const categories = useContentKnowledgeCategories();
  const { t } = useTranslation('knowledge');
  if ((!isNew && article.data === undefined) || categories.data === undefined) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        {article.isError || categories.isError ? (
          <Text className="p-lg text-start text-md text-error">{t('playerLoadFailed')}</Text>
        ) : (
          <AnnouncementFeedSkeleton accessibilityLabel={t('editTitle')} />
        )}
      </SafeAreaView>
    );
  }
  return (
    <KnowledgeForm
      articleId={id}
      article={isNew ? undefined : article.data}
      categories={categories.data}
    />
  );
}
