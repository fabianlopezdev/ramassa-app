import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { FailureNotice } from '@/components/error-code-line';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { SuccessPop } from '@/components/motion/success-pop';
import { continuousCorners } from '@/lib/continuous-corners';
import { uploadFeedbackImage, type FeedbackImageDraft } from '@/lib/feedback-upload';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useCreateFeedback, usePlayerFeedback } from '@/lib/player-feedback';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNetworkState } from 'expo-network';
import { Stack } from 'expo-router/stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  FEEDBACK_CONTENT_MAX_LENGTH,
  FEEDBACK_TYPES,
  feedbackSubmissionSchema,
  type FeedbackStatus,
  type FeedbackSubmission,
  type FeedbackType,
} from '@ramassa/shared/feedback';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const FEEDBACK_PREVIEW_ASPECT_RATIO = 4 / 3;
const EMPTY_FEEDBACK: readonly FeedbackSubmission[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  content: { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.lg },
  message: { minHeight: tokens.spacing['3xl'] * 2, writingDirection: 'auto' },
  mixedDirectionText: { writingDirection: 'auto' },
  preview: { width: '100%', aspectRatio: FEEDBACK_PREVIEW_ASPECT_RATIO },
});
const IMAGE_PICKER_ORIGINAL_QUALITY = 1;
const typeKey: Readonly<Record<FeedbackType, string>> = {
  activity_proposal: 'typeActivityProposal',
  idea: 'typeIdea',
  problem: 'typeProblem',
  general: 'typeGeneral',
};
const statusKey: Readonly<Record<FeedbackStatus, string>> = {
  new: 'statusNew',
  read: 'statusRead',
  in_progress: 'statusInProgress',
  resolved: 'statusResolved',
};
const feedbackKeyExtractor = (submission: FeedbackSubmission) => submission.id;

interface FeedbackHistoryCardProps {
  readonly id: string;
  readonly content: string;
  readonly typeLabel: string;
  readonly statusAndDate: string;
  readonly languageFontClass: string;
}

function FeedbackHistoryCard({
  id,
  content,
  typeLabel,
  statusAndDate,
  languageFontClass,
}: FeedbackHistoryCardProps) {
  return (
    <FormWidth className="pb-md">
      <View
        testID={`feedback-history-${id}`}
        className="gap-xs rounded-lg border border-neutral-200 bg-white p-lg"
        style={continuousCorners}
      >
        <Text className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}>
          {typeLabel}
        </Text>
        <Text
          selectable
          style={styles.mixedDirectionText}
          className={`text-start text-md text-neutral-700 ${languageFontClass}`}
        >
          {content}
        </Text>
        <Text
          selectable
          className={`text-start text-sm font-medium tabular-nums text-primary ${languageFontClass}`}
        >
          {statusAndDate}
        </Text>
      </View>
    </FormWidth>
  );
}

export default function FeedbackScreen() {
  const { t, i18n } = useTranslation(['feedback', 'common', 'errors']);
  const languageFontClass = useLanguageFontClass();
  const { session } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const feedbackQuery = usePlayerFeedback();
  const { error: createError, mutateAsync: createFeedbackAsync } = useCreateFeedback();
  const [type, setType] = useState<FeedbackType>('activity_proposal');
  const [content, setContent] = useState('');
  const [image, setImage] = useState<FeedbackImageDraft | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localErrorCode, setLocalErrorCode] = useState<AppErrorCode | null>(null);
  const submissionInFlight = useRef(false);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, { dateStyle: 'medium' }),
    [i18n.resolvedLanguage],
  );
  const mutationError = createError === null ? null : toAppError(createError).code;
  const errorCode = localErrorCode ?? mutationError;
  const insets = useSafeAreaInsets();
  const contentContainerStyle = useMemo(
    () => [
      styles.content,
      process.env.EXPO_OS === 'android'
        ? { paddingBottom: insets.bottom + tokens.spacing.lg }
        : undefined,
    ],
    [insets.bottom],
  );
  const screenOptions = useMemo(
    () => ({
      headerShown: true,
      headerBackButtonDisplayMode: 'minimal' as const,
      title: t('feedback:title'),
    }),
    [t],
  );

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: IMAGE_PICKER_ORIGINAL_QUALITY,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) return;
    setImage({ uri: asset.uri, width: asset.width, height: asset.height });
  }, []);

  const submit = useCallback(async () => {
    if (submissionInFlight.current) return;
    setLocalErrorCode(null);
    const parsed = feedbackSubmissionSchema.safeParse({ type, content, imageObjectKey: null });
    if (!parsed.success) {
      setLocalErrorCode('VALIDATION-1');
      return;
    }
    if (!isOnline) {
      setLocalErrorCode('NETWORK-1');
      return;
    }
    submissionInFlight.current = true;
    setIsSubmitting(true);
    try {
      let imageObjectKey: string | null = null;
      if (image !== null) {
        if (session === null) {
          setLocalErrorCode('AUTH-2');
          return;
        }
        if (mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL === undefined) {
          setLocalErrorCode('UPLOAD-1');
          return;
        }
        imageObjectKey = await uploadFeedbackImage({
          draft: image,
          accessToken: session.access_token,
          mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        });
      }
      await createFeedbackAsync({ ...parsed.data, imageObjectKey });
      setContent('');
      setImage(null);
      setIsComplete(true);
    } catch (error) {
      setLocalErrorCode(toAppError(error).code);
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  }, [content, createFeedbackAsync, image, isOnline, session, type]);
  const renderFeedback = useCallback(
    ({ item }: ListRenderItemInfo<FeedbackSubmission>) => (
      <FeedbackHistoryCard
        id={item.id}
        content={item.content}
        typeLabel={t(`feedback:${typeKey[item.type]}`)}
        statusAndDate={`${t(`feedback:${statusKey[item.status]}`)} · ${dateFormatter.format(
          new Date(item.createdAt),
        )}`}
        languageFontClass={languageFontClass}
      />
    ),
    [dateFormatter, languageFontClass, t],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <FlashList
        testID="feedback-screen"
        accessibilityRole="list"
        accessibilityLabel={t('feedback:historyTitle')}
        data={feedbackQuery.data ?? EMPTY_FEEDBACK}
        renderItem={renderFeedback}
        keyExtractor={feedbackKeyExtractor}
        style={styles.screen}
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <FormWidth className="gap-lg pb-md">
            <View className="gap-xs">
              <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                {t('feedback:intro')}
              </Text>
            </View>

            {isComplete ? (
              <SuccessPop>
                <View
                  testID="feedback-confirmation"
                  accessibilityRole="alert"
                  className="gap-md rounded-lg border border-success bg-white p-lg"
                  style={continuousCorners}
                >
                  <Text
                    className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
                  >
                    {t('feedback:successTitle')}
                  </Text>
                  <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
                    {t('feedback:successBody')}
                  </Text>
                  <PressableScale
                    accessibilityLabel={t('feedback:submitAnother')}
                    onPress={() => setIsComplete(false)}
                    haptic="tapLight"
                    style={continuousCorners}
                    className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
                  >
                    <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                      {t('feedback:submitAnother')}
                    </Text>
                  </PressableScale>
                </View>
              </SuccessPop>
            ) : (
              <View
                className="gap-lg rounded-lg border border-neutral-200 bg-white p-lg"
                style={continuousCorners}
              >
                <Text
                  accessibilityRole="header"
                  className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
                >
                  {t('feedback:newSubmission')}
                </Text>
                <Text
                  className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}
                >
                  {t('feedback:typeLabel')}
                </Text>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('feedback:typeLabel')}
                  className="flex-row flex-wrap gap-sm"
                >
                  {FEEDBACK_TYPES.map((option) => (
                    <PressableScale
                      key={option}
                      testID={`feedback-type-${option}`}
                      accessibilityRole="radio"
                      accessibilityLabel={t(`feedback:${typeKey[option]}`)}
                      isSelected={type === option}
                      onPress={() => setType(option)}
                      haptic="selection"
                      className={`min-h-recommended justify-center rounded-full border px-md ${type === option ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'}`}
                    >
                      <Text
                        className={`text-md font-medium ${type === option ? 'text-white' : 'text-neutral-800'} ${languageFontClass}`}
                      >
                        {t(`feedback:${typeKey[option]}`)}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
                <AuthTextField
                  label={t('feedback:contentLabel')}
                  placeholder={t('feedback:contentPlaceholder')}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  textAlignVertical="top"
                  maxLength={FEEDBACK_CONTENT_MAX_LENGTH}
                  style={styles.message}
                />
                {image === null ? null : (
                  <Image
                    source={{ uri: image.uri }}
                    accessibilityRole="image"
                    accessibilityLabel={t('feedback:imageAdd')}
                    style={styles.preview}
                    contentFit="cover"
                  />
                )}
                <View className="flex-row flex-wrap gap-sm">
                  <PressableScale
                    testID="feedback-pick-image"
                    accessibilityLabel={
                      image === null ? t('feedback:imageAdd') : t('feedback:imageChange')
                    }
                    onPress={() => void pickImage()}
                    haptic="tapLight"
                    isBusy={isSubmitting}
                    style={continuousCorners}
                    className="min-h-recommended grow items-center justify-center rounded-md border border-primary px-lg"
                  >
                    <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                      {image === null ? t('feedback:imageAdd') : t('feedback:imageChange')}
                    </Text>
                  </PressableScale>
                  {image === null ? null : (
                    <PressableScale
                      accessibilityLabel={t('feedback:imageRemove')}
                      onPress={() => setImage(null)}
                      haptic="selection"
                      isBusy={isSubmitting}
                      style={continuousCorners}
                      className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
                    >
                      <Text className={`text-md font-medium text-error ${languageFontClass}`}>
                        {t('feedback:imageRemove')}
                      </Text>
                    </PressableScale>
                  )}
                </View>
                {errorCode === null ? null : (
                  <FailureNotice code={errorCode} message={t(`errors:${errorCode}`)} />
                )}
                <AuthSubmitButton
                  testID="feedback-submit"
                  label={isSubmitting ? t('feedback:sending') : t('feedback:submit')}
                  onPress={() => void submit()}
                  isLoading={isSubmitting}
                />
              </View>
            )}

            <View className="gap-md">
              <Text
                accessibilityRole="header"
                className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('feedback:historyTitle')}
              </Text>
              {feedbackQuery.isPending ? (
                <View
                  accessible
                  accessibilityLabel={t('common:loading')}
                  accessibilityState={{ busy: true }}
                  className="gap-sm"
                >
                  <SkeletonPulse className="h-lg w-1/3 rounded-md" />
                  <SkeletonPulse className="h-3xl w-full rounded-md" />
                </View>
              ) : null}
              {feedbackQuery.isError ? (
                <FailureNotice
                  code={toAppError(feedbackQuery.error).code}
                  message={t('feedback:loadFailed')}
                />
              ) : null}
              {feedbackQuery.data?.length === 0 ? (
                <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                  {t('feedback:historyEmpty')}
                </Text>
              ) : null}
            </View>
          </FormWidth>
        }
      />
    </>
  );
}
