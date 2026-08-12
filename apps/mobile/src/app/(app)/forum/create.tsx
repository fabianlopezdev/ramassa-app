import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ErrorCodeLine } from '@/components/error-code-line';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { continuousCorners } from '@/lib/continuous-corners';
import { compressNativeStoryImage } from '@/lib/native-image-compression';
import type { CompressedNativeStoryImage } from '@/lib/native-image-compression-core';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useCreateForumPost, useForumCategories } from '@/lib/player-forum';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { FORUM_POST_MAX_LENGTH, forumPostInputSchema } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  input: { minHeight: tokens.spacing['3xl'] * 2 },
  preview: { width: '100%', height: tokens.spacing['3xl'] * 4 },
});

export default function ForumPostComposerScreen() {
  const { t } = useTranslation(['forum', 'common']);
  const { back, replace } = useRouter();
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const categoriesQuery = useForumCategories();
  const createPost = useCreateForumPost();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [image, setImage] = useState<CompressedNativeStoryImage | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [localErrorCode, setLocalErrorCode] = useState<AppErrorCode | null>(null);
  const mutationErrorCode = createPost.error === null ? null : toAppError(createPost.error).code;
  const errorCode = localErrorCode ?? mutationErrorCode;
  const remaining = FORUM_POST_MAX_LENGTH - content.length;
  const insets = useSafeAreaInsets();
  const contentInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: insets.top + tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing.lg,
          }
        : undefined,
    [insets.bottom, insets.top],
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
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;
    setIsProcessingPhoto(true);
    try {
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
      const postId = await createPost.mutateAsync({
        categoryId: parsed.data.categoryId,
        content: parsed.data.content,
        image,
      });
      replace(`/forum/${postId}` as Href);
    } catch {
      return;
    }
  }, [categoryId, content, createPost, image, replace, t]);

  return (
    <ScrollView
      testID="forum-create-screen"
      className="flex-1 bg-white"
      contentContainerClassName="grow px-lg py-lg"
      contentContainerStyle={contentInsets}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <FormWidth className="gap-lg">
        <PressableScale
          accessibilityLabel={t('common:back')}
          onPress={back}
          haptic="tapLight"
          className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
        >
          <Text className={`font-medium text-primary ${languageFontClass}`}>
            {t('common:back')}
          </Text>
        </PressableScale>
        <View className="gap-xs">
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('forum:composerTitle')}
          </Text>
          <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
            {t('forum:composerIntro')}
          </Text>
        </View>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('forum:categoriesLabel')}
          className="flex-row flex-wrap gap-sm"
        >
          {(categoriesQuery.data ?? []).map((category) => {
            const label = resolveLocalizedText(category.name, language)?.text ?? category.slug;
            const selected = category.id === categoryId;
            return (
              <PressableScale
                key={category.id}
                testID={`forum-compose-category-${category.slug}`}
                accessibilityRole="radio"
                accessibilityLabel={label}
                isSelected={selected}
                onPress={() => setCategoryId(category.id)}
                haptic="selection"
                style={continuousCorners}
                className={`min-h-recommended justify-center rounded-full border px-lg ${selected ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'}`}
              >
                <Text
                  className={`font-semibold ${selected ? 'text-white' : 'text-neutral-800'} ${languageFontClass}`}
                >
                  {label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        <AuthTextField
          testID="forum-post-content"
          label={t('forum:contentLabel')}
          placeholder={t('forum:contentPlaceholder')}
          value={content}
          onChangeText={setContent}
          maxLength={FORUM_POST_MAX_LENGTH}
          multiline
          numberOfLines={7}
          textAlignVertical="top"
          style={styles.input}
        />
        <Text className={`text-end text-sm tabular-nums text-neutral-600 ${languageFontClass}`}>
          {t('forum:charactersRemaining', { count: remaining })}
        </Text>
        <View className="gap-sm">
          <PressableScale
            testID="forum-add-photo"
            accessibilityLabel={image === null ? t('forum:addPhoto') : t('forum:changePhoto')}
            onPress={() => void choosePhoto()}
            haptic="tapLight"
            isDisabled={isProcessingPhoto}
            isBusy={isProcessingPhoto}
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
          >
            <Text className={`font-bold text-primary ${languageFontClass}`}>
              {isProcessingPhoto
                ? t('forum:processingPhoto')
                : image === null
                  ? t('forum:addPhoto')
                  : t('forum:changePhoto')}
            </Text>
          </PressableScale>
          {isProcessingPhoto ? (
            <ActivityIndicator accessibilityLabel={t('forum:processingPhoto')} />
          ) : null}
          {image === null ? null : (
            <View className="gap-sm">
              <Image
                source={{ uri: image.uri }}
                accessibilityLabel={t('forum:photoReady')}
                contentFit="cover"
                style={styles.preview}
              />
              <PressableScale
                accessibilityLabel={t('forum:removePhoto')}
                onPress={() => setImage(null)}
                haptic="tapLight"
                className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
              >
                <Text className={`text-neutral-700 ${languageFontClass}`}>
                  {t('forum:removePhoto')}
                </Text>
              </PressableScale>
            </View>
          )}
        </View>
        {!isOnline ? (
          <Text
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
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className={`text-start text-sm text-error ${languageFontClass}`}
              >
                {validationMessage ?? t('forum:publishFailed')}
              </Text>
            )}
            {errorCode === null ? null : <ErrorCodeLine code={errorCode} />}
            <AuthSubmitButton
              testID="forum-publish"
              label={createPost.isPending ? t('forum:publishing') : t('forum:publish')}
              onPress={() => void submit()}
              isLoading={createPost.isPending}
              disabled={!isOnline || isProcessingPhoto || categoriesQuery.isPending}
            />
          </View>
        </ShakeOnError>
      </FormWidth>
    </ScrollView>
  );
}
