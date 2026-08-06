import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ErrorCodeLine } from '@/components/error-code-line';
import { FormWidth } from '@/components/layout/content-width';
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
  useSubmitPlayerStory,
} from '@/lib/player-knowledge';
import { useStorySubmissionScrollReset } from '@/lib/story-submission-scroll';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNetworkState } from 'expo-network';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { useLanguage } from '@ramassa/shared/i18n';
import type { StoryStatus } from '@ramassa/shared/knowledge';
import { MAX_STORY_IMAGES, participantStoryDraftSchema } from '@ramassa/shared/story-submission';
import { tokens } from '@ramassa/shared/tokens';

const addPhotoSymbol: SymbolViewProps['name'] = {
  ios: 'photo.badge.plus',
  android: 'add_photo_alternate',
  web: 'add_photo_alternate',
};
const checkSymbol: SymbolViewProps['name'] = {
  ios: 'checkmark',
  android: 'check',
  web: 'check',
};
const styles = StyleSheet.create({
  storyInput: { minHeight: tokens.spacing['3xl'] * 2 },
  photo: { width: tokens.tapTarget.recommended * 2, height: tokens.tapTarget.recommended * 2 },
});

function statusTranslationKey(status: StoryStatus) {
  if (status === 'in_review') return 'knowledge:storyStatusInReview' as const;
  if (status === 'changes_requested') return 'knowledge:storyStatusChangesRequested' as const;
  if (status === 'published') return 'knowledge:storyStatusPublished' as const;
  if (status === 'rejected') return 'knowledge:storyStatusRejected' as const;
  return 'knowledge:storyStatusSubmitted' as const;
}

export default function StorySubmissionScreen() {
  const { t, i18n } = useTranslation(['knowledge', 'common']);
  const router = useRouter();
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const categoriesQuery = usePlayerKnowledgeCategories();
  const statusesQuery = useOwnParticipantStoryStatuses();
  const submitStory = useSubmitPlayerStory();
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
  const mutationErrorCode = submitStory.error === null ? null : toAppError(submitStory.error).code;
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
      quality: 1,
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

  const submit = useCallback(async () => {
    setValidationMessage(null);
    setLocalErrorCode(null);
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
      await submitStory.mutateAsync({
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
  }, [defaultCategoryId, hasConsent, images, language, story, submitStory, t, title]);

  const insets = useSafeAreaInsets();
  const androidEdgeInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: insets.top + tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing.lg,
          }
        : undefined,
    [insets.bottom, insets.top],
  );

  return (
    <ScrollView
      ref={scrollViewRef}
      testID="story-submission-screen"
      className="flex-1 bg-white"
      contentContainerClassName="grow px-lg py-lg"
      contentContainerStyle={androidEdgeInsets}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <FormWidth className="gap-lg">
        <PressableScale
          accessibilityLabel={t('common:back')}
          onPress={() => router.back()}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
        >
          <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
            {t('common:back')}
          </Text>
        </PressableScale>

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
              <PressableScale
                accessibilityLabel={t('knowledge:submitAnother')}
                onPress={() => setIsComplete(false)}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
              >
                <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                  {t('knowledge:submitAnother')}
                </Text>
              </PressableScale>
            </View>
          </SuccessPop>
        ) : (
          <View className="gap-lg">
            <View className="gap-xs">
              <Text
                accessibilityRole="header"
                className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('knowledge:submissionTitle')}
              </Text>
              <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                {t('knowledge:submissionIntro')}
              </Text>
            </View>
            <AuthTextField
              testID="story-title-input"
              label={t('knowledge:submissionFieldTitle')}
              placeholder={t('knowledge:submissionTitleHint')}
              value={title}
              maxLength={200}
              returnKeyType="next"
              onChangeText={setTitle}
            />
            <AuthTextField
              testID="story-body-input"
              label={t('knowledge:submissionFieldStory')}
              placeholder={t('knowledge:submissionStoryHint')}
              value={story}
              maxLength={10_000}
              multiline
              numberOfLines={7}
              textAlignVertical="top"
              style={styles.storyInput}
              onChangeText={setStory}
            />
            <View className="gap-sm">
              <PressableScale
                testID="story-add-photos"
                accessibilityLabel={t('knowledge:addPhotos')}
                onPress={() => void choosePhotos()}
                haptic="tapLight"
                isDisabled={images.length >= MAX_STORY_IMAGES || isProcessingPhoto}
                isBusy={isProcessingPhoto}
                style={continuousCorners}
                className="min-h-recommended flex-row items-center justify-center gap-sm rounded-md border border-primary px-lg"
              >
                {isProcessingPhoto ? (
                  <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
                ) : (
                  <SymbolView
                    name={addPhotoSymbol}
                    size={tokens.fontSize.xl}
                    tintColor={tokens.colors.primary.DEFAULT}
                  />
                )}
                <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                  {isProcessingPhoto ? t('knowledge:processingPhoto') : t('knowledge:addPhotos')}
                </Text>
              </PressableScale>
              <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                {t('knowledge:photoCount', { count: images.length, maximum: MAX_STORY_IMAGES })}
              </Text>
              <View className="flex-row flex-wrap gap-sm">
                {images.map((image, index) => (
                  <View key={image.uri} className="gap-xs">
                    <Image
                      accessibilityLabel={t('knowledge:storyPhoto', {
                        number: index + 1,
                        title: title || t('knowledge:submissionTitle'),
                      })}
                      source={{ uri: image.uri }}
                      contentFit="cover"
                      style={styles.photo}
                    />
                    <PressableScale
                      accessibilityLabel={t('knowledge:removePhoto', { number: index + 1 })}
                      onPress={() => removePhoto(image.uri)}
                      haptic="tapLight"
                      style={continuousCorners}
                      className="min-h-min items-center justify-center rounded-md border border-neutral-300 px-sm"
                    >
                      <Text className={`text-xs text-neutral-700 ${languageFontClass}`}>
                        {t('knowledge:imageRemove')}
                      </Text>
                    </PressableScale>
                  </View>
                ))}
              </View>
            </View>
            <PressableScale
              testID="story-publication-consent"
              accessibilityRole="checkbox"
              accessibilityLabel={t('knowledge:publicationConsent')}
              onPress={() => setHasConsent((current) => !current)}
              haptic="selection"
              isSelected={hasConsent}
              style={continuousCorners}
              className={`min-h-recommended flex-row items-start gap-md rounded-md border p-md ${
                hasConsent ? 'border-primary bg-primary/10' : 'border-neutral-300 bg-white'
              }`}
            >
              <View className="h-lg w-lg items-center justify-center rounded-sm border border-primary">
                {hasConsent ? (
                  <SymbolView
                    name={checkSymbol}
                    size={tokens.fontSize.md}
                    tintColor={tokens.colors.primary.dark}
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
            {!isOnline ? (
              <Text
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
                    accessibilityRole="alert"
                    className={`text-start text-sm text-error ${languageFontClass}`}
                  >
                    {validationMessage ?? t('knowledge:submissionFailed')}
                  </Text>
                )}
                {errorCode === null ? null : <ErrorCodeLine code={errorCode} />}
                <AuthSubmitButton
                  testID="story-submit-button"
                  label={
                    submitStory.isPending
                      ? t('knowledge:submittingStory')
                      : t('knowledge:submitStory')
                  }
                  onPress={() => void submit()}
                  isLoading={submitStory.isPending}
                  disabled={!isOnline || isProcessingPhoto || defaultCategoryId === undefined}
                />
              </View>
            </ShakeOnError>
          </View>
        )}

        <View className="gap-sm pt-lg">
          <Text
            accessibilityRole="header"
            className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('knowledge:myStories')}
          </Text>
          {(statusesQuery.data ?? []).length === 0 ? (
            <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
              {t('knowledge:myStoriesEmpty')}
            </Text>
          ) : (
            (statusesQuery.data ?? []).map((status) => (
              <View
                key={status.id}
                testID={`story-status-${status.story_status}`}
                className="gap-xs rounded-md border border-neutral-200 bg-neutral-50 p-md"
                style={continuousCorners}
              >
                <Text
                  className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}
                >
                  {t(statusTranslationKey(status.story_status))}
                </Text>
                <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                  {t('knowledge:storySubmittedDate', {
                    date: dateFormatter.format(new Date(status.created_at)),
                  })}
                </Text>
              </View>
            ))
          )}
        </View>
      </FormWidth>
    </ScrollView>
  );
}
