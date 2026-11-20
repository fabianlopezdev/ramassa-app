import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { Icon, type IconName } from '@/components/icons/icon';
import { StoryImagePreview } from '@/components/knowledge/story-image-preview';
import { FormWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { OpenableCard } from '@/components/layout/openable-card';
import { ActionScreen } from '@/components/layout/screen-action';
import { ScreenSection } from '@/components/layout/screen-section';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { SuccessPop } from '@/components/motion/success-pop';
import { continuousCorners } from '@/lib/continuous-corners';
import { compressNativeStoryImage } from '@/lib/native-image-compression';
import type { CompressedNativeStoryImage } from '@/lib/native-image-compression-core';
import { isNetworkStateOnline } from '@/lib/network-status';
import {
  useOwnParticipantStoryStatuses,
  usePlayerKnowledgeCategories,
  useResendPlayerStory,
  useSubmitPlayerStory,
} from '@/lib/player-knowledge';
import { useStorySubmissionScrollReset } from '@/lib/story-submission-scroll';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import * as ImagePicker from 'expo-image-picker';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import {
  participantStoryEditableDraft,
  type ParticipantStoryStatusRow,
  type StoryStatus,
} from '@ramassa/shared/knowledge';
import { MAX_STORY_IMAGES, participantStoryDraftSchema } from '@ramassa/shared/story-submission';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  storyInput: { minHeight: tokens.spacing['3xl'] * 2 },
});
const STORY_TITLE_MAX_LENGTH = participantStoryDraftSchema.shape.title.maxLength ?? undefined;
const STORY_TEXT_MAX_LENGTH = participantStoryDraftSchema.shape.story.maxLength ?? undefined;
const STORY_TEXT_VISIBLE_LINES = 7;
const IMAGE_PICKER_ORIGINAL_QUALITY = 1;

/** The outlined action with an icon: add photos, and edit a story sent back for changes. */
function OutlinedIconAction({
  testID,
  label,
  symbol,
  onPress,
  isDisabled = false,
  isBusy = false,
}: {
  readonly testID: string;
  readonly label: string;
  readonly symbol: IconName;
  readonly onPress: () => void;
  readonly isDisabled?: boolean;
  readonly isBusy?: boolean;
}) {
  return (
    <RaisedActionButton
      testID={testID}
      icon={symbol}
      label={label}
      onPress={onPress}
      isDisabled={isDisabled === true || isBusy === true}
    />
  );
}

function StoryTeamNote({ testID, note }: { readonly testID: string; readonly note: string }) {
  const { t } = useTranslation('knowledge');
  const languageFontClass = useLanguageFontClass();
  return (
    <View testID={testID} className="gap-xs rounded-md bg-white p-sm" style={continuousCorners}>
      <Text className={`text-start text-sm font-bold text-neutral-800 ${languageFontClass}`}>
        {t('knowledge:storyTeamNote')}
      </Text>
      <Text selectable className={`text-start text-md text-neutral-800 ${languageFontClass}`}>
        {note}
      </Text>
    </View>
  );
}

function statusTranslationKey(status: StoryStatus) {
  if (status === 'in_review') return 'knowledge:storyStatusInReview' as const;
  if (status === 'changes_requested') return 'knowledge:storyStatusChangesRequested' as const;
  if (status === 'published') return 'knowledge:storyStatusPublished' as const;
  if (status === 'rejected') return 'knowledge:storyStatusRejected' as const;
  return 'knowledge:storyStatusSubmitted' as const;
}

export default function StorySubmissionScreen() {
  const { t, i18n } = useTranslation(['knowledge', 'common']);
  const { push } = useRouter();
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const categoriesQuery = usePlayerKnowledgeCategories();
  const statusesQuery = useOwnParticipantStoryStatuses();
  const {
    error: submitStoryError,
    isPending: isSubmitPending,
    mutateAsync: submitStoryAsync,
  } = useSubmitPlayerStory();
  const {
    error: resendStoryError,
    isPending: isResendPending,
    mutateAsync: resendStoryAsync,
  } = useResendPlayerStory();
  const [editingStory, setEditingStory] = useState<ParticipantStoryStatusRow | null>(null);
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [images, setImages] = useState<readonly CompressedNativeStoryImage[]>([]);
  const [hasConsent, setHasConsent] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [localErrorCode, setLocalErrorCode] = useState<AppErrorCode | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const defaultCategoryId =
    categoriesQuery.data?.find((category) => category.slug === 'general-resources')?.id ??
    categoriesQuery.data?.[0]?.id;
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', { dateStyle: 'medium' }),
    [i18n.resolvedLanguage],
  );
  const mutationError = editingStory === null ? submitStoryError : resendStoryError;
  const mutationErrorCode = mutationError === null ? null : toAppError(mutationError).code;
  const isSendPending = editingStory === null ? isSubmitPending : isResendPending;
  const editingNote = editingStory?.reviewer_note?.trim() ?? '';
  const errorCode = localErrorCode ?? mutationErrorCode;
  const resetScroll = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  useStorySubmissionScrollReset(isComplete, resetScroll);

  const choosePhotos = useCallback(async () => {
    if (images.length >= MAX_STORY_IMAGES) {
      setValidationMessage(t('knowledge:photoLimit'));
      setLocalErrorCode('VALIDATION-1');
      return;
    }
    setValidationMessage(null);
    setLocalErrorCode(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setValidationMessage(t('knowledge:photoPermission'));
      setLocalErrorCode('UPLOAD-2');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_STORY_IMAGES - images.length,
      quality: IMAGE_PICKER_ORIGINAL_QUALITY,
    });
    if (result.canceled) return;
    setIsProcessingPhoto(true);
    try {
      const compressed = await Promise.all(
        result.assets.map((asset) =>
          compressNativeStoryImage({ uri: asset.uri, width: asset.width, height: asset.height }),
        ),
      );
      setImages((current) => [...current, ...compressed].slice(0, MAX_STORY_IMAGES));
    } catch (error) {
      const appError = toAppError(error);
      setValidationMessage(
        appError.code === 'UPLOAD-3'
          ? t('knowledge:photoTooLarge')
          : t('knowledge:submissionFailed'),
      );
      setLocalErrorCode(appError.code);
    } finally {
      setIsProcessingPhoto(false);
    }
  }, [images.length, t]);

  const removePhoto = useCallback((uri: string) => {
    setImages((current) => current.filter((image) => image.uri !== uri));
  }, []);

  const resend = useCallback(
    async (storyId: string) => {
      const draft = participantStoryDraftSchema
        .pick({ title: true, story: true })
        .safeParse({ title, story });
      if (!draft.success) {
        const field = draft.error.issues[0]?.path[0];
        setValidationMessage(
          field === 'title' ? t('knowledge:titleRequired') : t('knowledge:storyRequired'),
        );
        setLocalErrorCode('VALIDATION-1');
        return;
      }
      try {
        await resendStoryAsync({ storyId, title: draft.data.title, story: draft.data.story });
        setIsComplete(true);
        setEditingStory(null);
        setTitle('');
        setStory('');
      } catch {
        return;
      }
    },
    [resendStoryAsync, story, t, title],
  );

  const submit = useCallback(async () => {
    setValidationMessage(null);
    setLocalErrorCode(null);
    if (editingStory !== null) {
      await resend(editingStory.id);
      return;
    }
    if (defaultCategoryId === undefined) {
      setValidationMessage(t('knowledge:playerLoadFailed'));
      setLocalErrorCode('DB-1');
      return;
    }
    const draft = participantStoryDraftSchema.safeParse({
      title,
      story,
      images,
      publicationConsent: hasConsent,
    });
    if (!draft.success) {
      const field = draft.error.issues[0]?.path[0];
      setValidationMessage(
        field === 'title'
          ? t('knowledge:titleRequired')
          : field === 'story'
            ? t('knowledge:storyRequired')
            : t('knowledge:consentRequired'),
      );
      setLocalErrorCode('VALIDATION-1');
      return;
    }
    try {
      await submitStoryAsync({
        categoryId: defaultCategoryId,
        language,
        title: draft.data.title,
        story: draft.data.story,
        images,
      });
      setIsComplete(true);
      setTitle('');
      setStory('');
      setImages([]);
      setHasConsent(false);
    } catch {
      return;
    }
  }, [
    defaultCategoryId,
    editingStory,
    hasConsent,
    images,
    language,
    resend,
    story,
    submitStoryAsync,
    t,
    title,
  ]);

  const startEditing = useCallback(
    (row: ParticipantStoryStatusRow) => {
      const draft = participantStoryEditableDraft(row);
      if (draft === null) return;
      setEditingStory(row);
      setTitle(draft.title);
      setStory(draft.story);
      setImages([]);
      setHasConsent(false);
      setValidationMessage(null);
      setLocalErrorCode(null);
      setIsComplete(false);
      resetScroll();
    },
    [resetScroll],
  );
  const cancelEditing = useCallback(() => {
    setEditingStory(null);
    setTitle('');
    setStory('');
    setValidationMessage(null);
    setLocalErrorCode(null);
  }, []);

  const addPhotos = useCallback(() => void choosePhotos(), [choosePhotos]);
  const submitForm = useCallback(() => void submit(), [submit]);
  const submitAnother = useCallback(() => setIsComplete(false), []);
  const toggleConsent = useCallback(() => setHasConsent((current) => !current), []);

  const insets = useSafeAreaInsets();
  const androidEdgeInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing.lg,
          }
        : undefined,
    [insets.bottom],
  );

  return (
    <ActionScreen
      className="bg-white"
      action={
        !isComplete ? (
          <AuthSubmitButton
            testID="story-submit-button"
            label={
              editingStory === null
                ? isSendPending
                  ? t('knowledge:submittingStory')
                  : t('knowledge:submitStory')
                : isSendPending
                  ? t('knowledge:resendingStory')
                  : t('knowledge:resendStory')
            }
            onPress={submitForm}
            isLoading={isSendPending}
            disabled={
              !isOnline ||
              isProcessingPhoto ||
              (editingStory === null && defaultCategoryId === undefined)
            }
          />
        ) : null
      }
    >
      <NativeScreenHeader surface="white" title={t('knowledge:submissionTitle')} />
      <ScrollView
        ref={scrollViewRef}
        testID="story-submission-screen"
        className="flex-1"
        contentContainerClassName="grow px-lg py-lg"
        contentContainerStyle={androidEdgeInsets}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <FormWidth className="gap-lg">
          {isComplete ? (
            <SuccessPop>
              <View
                accessibilityRole="alert"
                testID="story-submission-confirmation"
                className="gap-md rounded-lg border border-success bg-neutral-50 p-lg"
                style={continuousCorners}
              >
                <Text
                  accessibilityRole="header"
                  className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
                >
                  {t('knowledge:submissionSuccessTitle')}
                </Text>
                <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
                  {t('knowledge:submissionSuccessBody')}
                </Text>
                <RaisedActionButton label={t('knowledge:submitAnother')} onPress={submitAnother} />
              </View>
            </SuccessPop>
          ) : (
            <View className="gap-lg">
              {editingStory === null ? (
                <View className="gap-xs">
                  <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                    {t('knowledge:submissionIntro')}
                  </Text>
                </View>
              ) : editingNote.length === 0 ? null : (
                <StoryTeamNote testID="story-edit-team-note" note={editingNote} />
              )}
              <AuthTextField
                testID="story-title-input"
                label={t('knowledge:submissionFieldTitle')}
                placeholder={t('knowledge:submissionTitleHint')}
                value={title}
                maxLength={STORY_TITLE_MAX_LENGTH}
                returnKeyType="next"
                onChangeText={setTitle}
              />
              <AuthTextField
                testID="story-body-input"
                label={t('knowledge:submissionFieldStory')}
                placeholder={t('knowledge:submissionStoryHint')}
                value={story}
                maxLength={STORY_TEXT_MAX_LENGTH}
                multiline
                numberOfLines={STORY_TEXT_VISIBLE_LINES}
                textAlignVertical="top"
                style={styles.storyInput}
                onChangeText={setStory}
              />
              {editingStory !== null ? null : (
                <>
                  <View className="gap-sm">
                    <OutlinedIconAction
                      testID="story-add-photos"
                      label={
                        isProcessingPhoto
                          ? t('knowledge:processingPhoto')
                          : t('knowledge:addPhotos')
                      }
                      symbol="gallery-add"
                      onPress={addPhotos}
                      isDisabled={images.length >= MAX_STORY_IMAGES || isProcessingPhoto}
                      isBusy={isProcessingPhoto}
                    />
                    <Text
                      className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}
                    >
                      {t('knowledge:photoCount', {
                        count: images.length,
                        maximum: MAX_STORY_IMAGES,
                      })}
                    </Text>
                    <View className="flex-row flex-wrap gap-sm">
                      {images.map((image, index) => (
                        <StoryImagePreview
                          key={image.uri}
                          image={image}
                          number={index + 1}
                          title={title}
                          onRemove={removePhoto}
                        />
                      ))}
                    </View>
                  </View>
                  <PressableScale
                    testID="story-publication-consent"
                    accessibilityRole="checkbox"
                    accessibilityLabel={t('knowledge:publicationConsent')}
                    onPress={toggleConsent}
                    haptic="selection"
                    isSelected={hasConsent}
                    style={continuousCorners}
                    className={`min-h-recommended flex-row items-start gap-md rounded-md border p-md ${
                      hasConsent ? 'border-primary bg-primary/10' : 'border-neutral-300 bg-white'
                    }`}
                  >
                    <View
                      className="h-lg w-lg items-center justify-center rounded-sm border border-primary"
                      style={continuousCorners}
                    >
                      {hasConsent ? (
                        <Icon
                          name="check"
                          size={tokens.fontSize.md}
                          color={tokens.colors.primary.dark}
                        />
                      ) : null}
                    </View>
                    <View className="flex-1 gap-xs">
                      <Text
                        className={`text-start text-md font-medium text-neutral-900 ${languageFontClass}`}
                      >
                        {t('knowledge:publicationConsent')}
                      </Text>
                      <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                        {t('knowledge:publicationConsentHelp')}
                      </Text>
                    </View>
                  </PressableScale>
                </>
              )}
              {!isOnline ? (
                <Text
                  selectable
                  accessibilityRole="alert"
                  className={`text-start text-sm text-error ${languageFontClass}`}
                >
                  {t('knowledge:offlineSubmission')}
                </Text>
              ) : null}
              <ShakeOnError errorCode={errorCode}>
                <View className="gap-sm">
                  {validationMessage === null && mutationErrorCode === null ? null : (
                    <Text
                      selectable
                      accessibilityRole="alert"
                      className={`text-start text-sm text-error ${languageFontClass}`}
                    >
                      {validationMessage ?? t('knowledge:submissionFailed')}
                    </Text>
                  )}
                  {editingStory === null ? null : (
                    <RaisedActionButton
                      testID="story-edit-cancel"
                      label={t('knowledge:storyEditCancel')}
                      onPress={cancelEditing}
                      isDisabled={isSendPending}
                    />
                  )}
                </View>
              </ShakeOnError>
            </View>
          )}

          <ScreenSection title={t('knowledge:myStories')} isLast>
            {(statusesQuery.data ?? []).length === 0 ? (
              <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                {t('knowledge:myStoriesEmpty')}
              </Text>
            ) : (
              (statusesQuery.data ?? []).map((status) => {
                const storyTitle = resolveLocalizedText(status.title, language)?.text ?? '';
                const statusLabel = t(statusTranslationKey(status.story_status));
                const note = status.reviewer_note?.trim() ?? '';
                const isEditable = participantStoryEditableDraft(status) !== null;
                return (
                  <View key={status.id} className="gap-xs">
                    <OpenableCard
                      testID={`story-status-${status.story_status}`}
                      accessibilityLabel={[storyTitle, statusLabel, note]
                        .filter(Boolean)
                        .join('. ')}
                      onOpen={() => push(`/knowledge/${status.id}` as Href)}
                      className="rounded-md border border-neutral-200 bg-neutral-50 p-md"
                    >
                      <Text
                        className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}
                      >
                        {storyTitle}
                      </Text>
                      <Text
                        className={`text-start text-sm font-medium text-primary ${languageFontClass}`}
                      >
                        {statusLabel}
                      </Text>
                      <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                        {t('knowledge:storySubmittedDate', {
                          date: dateFormatter.format(new Date(status.created_at)),
                        })}
                      </Text>
                      {note.length === 0 ? null : (
                        <StoryTeamNote testID={`story-team-note-${status.id}`} note={note} />
                      )}
                    </OpenableCard>
                    {isEditable ? (
                      <OutlinedIconAction
                        testID={`story-edit-${status.id}`}
                        label={t('knowledge:editStory')}
                        symbol="pen"
                        onPress={() => startEditing(status)}
                        isDisabled={editingStory?.id === status.id}
                      />
                    ) : null}
                  </View>
                );
              })
            )}
          </ScreenSection>
        </FormWidth>
      </ScrollView>
    </ActionScreen>
  );
}
