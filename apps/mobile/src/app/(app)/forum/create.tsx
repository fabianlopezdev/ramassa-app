import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { ForumCategoryOption } from '@/components/forum/forum-category-tabs';
import { FormWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ActionScreen } from '@/components/layout/screen-action';
import { PhotoFocusPicker } from '@/components/media/photo-focus-picker';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { compressNativeStoryImage } from '@/lib/native-image-compression';
import type { CompressedNativeStoryImage } from '@/lib/native-image-compression-core';
import { isNetworkStateOnline } from '@/lib/network-status';
import {
  useCreateForumPost,
  useForumCategories,
  useOwnForumPostingStatus,
} from '@/lib/player-forum';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import * as ImagePicker from 'expo-image-picker';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import type { ForumCategoryRow } from '@ramassa/shared/forum';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import type { PhotoFocus } from '@ramassa/shared/photo-focus';
import { FORUM_POST_MAX_LENGTH, forumPostInputSchema } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

const FORUM_COMPOSER_INPUT_MIN_HEIGHT = tokens.spacing['3xl'] * 2;
const IMAGE_PICKER_ORIGINAL_QUALITY = 1;
const FORUM_COMPOSER_TEXT_LINES = 7;
const EMPTY_CATEGORIES: readonly ForumCategoryRow[] = [];
const styles = StyleSheet.create({
  input: { minHeight: FORUM_COMPOSER_INPUT_MIN_HEIGHT, writingDirection: 'auto' },
});

export default function ForumPostComposerScreen() {
  const { t } = useTranslation(['forum', 'common']);
  const { replace } = useRouter();
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const categoriesQuery = useForumCategories();
  const createPost = useCreateForumPost();
  const createPostAsync = createPost.mutateAsync;
  const postingStatus = useOwnForumPostingStatus();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [image, setImage] = useState<CompressedNativeStoryImage | null>(null);
  const [imageFocus, setImageFocus] = useState<PhotoFocus | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [localErrorCode, setLocalErrorCode] = useState<AppErrorCode | null>(null);
  const imageSource = useMemo(() => (image === null ? null : { uri: image.uri }), [image]);
  const mutationErrorCode = createPost.error === null ? null : toAppError(createPost.error).code;
  const errorCode = localErrorCode ?? mutationErrorCode;
  const postingDisabled = postingStatus.data === true;
  const remaining = FORUM_POST_MAX_LENGTH - content.length;
  const insets = useSafeAreaInsets();
  const contentInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing.lg,
          }
        : undefined,
    [insets.bottom],
  );

  const choosePhoto = useCallback(async () => {
    setValidationMessage(null);
    setLocalErrorCode(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setValidationMessage(t('forum:photoPermission'));
      setLocalErrorCode('UPLOAD-2');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: IMAGE_PICKER_ORIGINAL_QUALITY,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;
    setIsProcessingPhoto(true);
    try {
      // A new photo starts from the default crop (RAPP-932).
      setImageFocus(null);
      setImage(
        await compressNativeStoryImage({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        }),
      );
    } catch (error) {
      const code = toAppError(error).code;
      setValidationMessage(
        code === 'UPLOAD-3' ? t('forum:photoTooLarge') : t('forum:publishFailed'),
      );
      setLocalErrorCode(code);
    } finally {
      setIsProcessingPhoto(false);
    }
  }, [t]);
  const removePhoto = useCallback(() => {
    setImage(null);
    setImageFocus(null);
  }, []);

  const submit = useCallback(async () => {
    setValidationMessage(null);
    setLocalErrorCode(null);
    const parsed = forumPostInputSchema.safeParse({
      categoryId,
      content,
      imageObjectKey: null,
    });
    if (!parsed.success) {
      setValidationMessage(
        categoryId === null ? t('forum:categoryRequired') : t('forum:contentRequired'),
      );
      setLocalErrorCode('VALIDATION-1');
      return;
    }
    try {
      const postId = await createPostAsync({
        categoryId: parsed.data.categoryId,
        content: parsed.data.content,
        image,
        imageFocus,
      });
      replace(`/forum/${postId}` as Href);
    } catch {
      return;
    }
  }, [categoryId, content, createPostAsync, image, replace, t]);
  const renderCategory = useCallback(
    (category: ForumCategoryRow) => {
      const label = resolveLocalizedText(category.name, language)?.text ?? category.slug;
      return (
        <ForumCategoryOption
          key={category.id}
          id={category.id}
          label={label}
          selected={category.id === categoryId}
          onSelect={setCategoryId}
          testID={`forum-compose-category-${category.slug}`}
          accessibilityRole="radio"
          isDisabled={postingDisabled}
        />
      );
    },
    [categoryId, language, postingDisabled],
  );

  return (
    <ActionScreen
      className="bg-white"
      action={
        <AuthSubmitButton
          testID="forum-publish"
          label={createPost.isPending ? t('forum:publishing') : t('forum:publish')}
          onPress={submit}
          isLoading={createPost.isPending}
          disabled={
            !isOnline ||
            isProcessingPhoto ||
            categoriesQuery.isPending ||
            postingStatus.isPending ||
            postingDisabled
          }
        />
      }
    >
      <NativeScreenHeader surface="white" title={t('forum:composerTitle')} />
      <ScrollView
        testID="forum-create-screen"
        className="flex-1"
        contentContainerClassName="grow px-lg py-lg"
        contentContainerStyle={contentInsets}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <FormWidth className="gap-lg">
          <View className="gap-xs">
            <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
              {t('forum:composerIntro')}
            </Text>
          </View>
          {postingDisabled ? (
            <Text
              selectable
              accessibilityRole="alert"
              className={`text-start text-md text-neutral-700 ${languageFontClass}`}
            >
              {t('forum:postingDisabled')}
            </Text>
          ) : null}
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('forum:categoriesLabel')}
            className="flex-row flex-wrap gap-sm"
          >
            {(categoriesQuery.data ?? EMPTY_CATEGORIES).map(renderCategory)}
          </View>
          <AuthTextField
            testID="forum-post-content"
            label={t('forum:contentLabel')}
            placeholder={t('forum:contentPlaceholder')}
            value={content}
            onChangeText={setContent}
            maxLength={FORUM_POST_MAX_LENGTH}
            multiline
            numberOfLines={FORUM_COMPOSER_TEXT_LINES}
            textAlignVertical="top"
            style={styles.input}
            editable={!postingDisabled}
          />
          <Text className={`text-end text-sm tabular-nums text-neutral-600 ${languageFontClass}`}>
            {t('forum:charactersRemaining', { count: remaining })}
          </Text>
          <View className="gap-sm">
            <RaisedActionButton
              testID="forum-add-photo"
              label={
                isProcessingPhoto
                  ? t('forum:processingPhoto')
                  : image === null
                    ? t('forum:addPhoto')
                    : t('forum:changePhoto')
              }
              accessibilityLabel={image === null ? t('forum:addPhoto') : t('forum:changePhoto')}
              onPress={choosePhoto}
              isDisabled={isProcessingPhoto || postingDisabled || isProcessingPhoto}
            />
            {isProcessingPhoto ? (
              <ActivityIndicator
                accessibilityRole="progressbar"
                accessibilityLabel={t('forum:processingPhoto')}
              />
            ) : null}
            {imageSource === null ? null : (
              <View className="gap-sm">
                <PhotoFocusPicker
                  testID="forum-photo-focus"
                  source={imageSource}
                  aspectRatio={image === null ? null : image.width / image.height}
                  focus={imageFocus}
                  onChange={setImageFocus}
                />
                <RaisedActionButton label={t('forum:removePhoto')} onPress={removePhoto} />
              </View>
            )}
          </View>
          {!isOnline ? (
            <Text
              selectable
              accessibilityRole="alert"
              className={`text-start text-sm text-error ${languageFontClass}`}
            >
              {t('forum:offlineWrite')}
            </Text>
          ) : null}
          <ShakeOnError errorCode={errorCode}>
            <View className="gap-sm">
              {validationMessage === null && mutationErrorCode === null ? null : (
                <Text
                  selectable
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  className={`text-start text-sm text-error ${languageFontClass}`}
                >
                  {validationMessage ?? t('forum:publishFailed')}
                </Text>
              )}
            </View>
          </ShakeOnError>
        </FormWidth>
      </ScrollView>
    </ActionScreen>
  );
}
