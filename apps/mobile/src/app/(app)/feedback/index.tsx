import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { FailureNotice } from '@/components/error-code-line';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SuccessPop } from '@/components/motion/success-pop';
import { continuousCorners } from '@/lib/continuous-corners';
import { uploadFeedbackImage, type FeedbackImageDraft } from '@/lib/feedback-upload';
import { useCreateFeedback, usePlayerFeedback } from '@/lib/player-feedback';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  FEEDBACK_TYPES,
  feedbackSubmissionSchema,
  type FeedbackStatus,
  type FeedbackType,
} from '@ramassa/shared/feedback';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  message: { minHeight: tokens.spacing['3xl'] * 2 },
  preview: { width: '100%', aspectRatio: 4 / 3 },
});
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

export default function FeedbackScreen() {
  const { t, i18n } = useTranslation(['feedback', 'common', 'errors']);
  const languageFontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { session } = useAuth();
  const feedbackQuery = usePlayerFeedback();
  const createFeedback = useCreateFeedback();
  const [type, setType] = useState<FeedbackType>('activity_proposal');
  const [content, setContent] = useState('');
  const [image, setImage] = useState<FeedbackImageDraft | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [localErrorCode, setLocalErrorCode] = useState<AppErrorCode | null>(null);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', { dateStyle: 'medium' }),
    [i18n.resolvedLanguage],
  );
  const mutationError =
    createFeedback.error === null ? null : toAppError(createFeedback.error).code;
  const errorCode = localErrorCode ?? mutationError;
  const insets = useSafeAreaInsets();
  const androidInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: insets.top + tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing.lg,
          }
        : undefined,
    [insets.bottom, insets.top],
  );

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) return;
    setImage({ uri: asset.uri, width: asset.width, height: asset.height });
  }, []);

  const submit = useCallback(async () => {
    setLocalErrorCode(null);
    const parsed = feedbackSubmissionSchema.safeParse({ type, content, imageObjectKey: null });
    if (!parsed.success) {
      setLocalErrorCode('VALIDATION-1');
      return;
    }
    try {
      let imageObjectKey: string | null = null;
      if (image !== null) {
        if (session === null || mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL === undefined) {
          setLocalErrorCode('AUTH-2');
          return;
        }
        imageObjectKey = await uploadFeedbackImage({
          draft: image,
          accessToken: session.access_token,
          mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        });
      }
      await createFeedback.mutateAsync({ ...parsed.data, imageObjectKey });
      setContent('');
      setImage(null);
      setIsComplete(true);
    } catch (error) {
      setLocalErrorCode(toAppError(error).code);
    }
  }, [content, createFeedback, image, session, type]);

  return (
    <ScrollView
      testID="feedback-screen"
      className="flex-1 bg-neutral-50"
      contentContainerClassName="grow px-lg py-lg"
      contentContainerStyle={androidInsets}
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
          <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
            {t('common:back')}
          </Text>
        </PressableScale>
        <View className="gap-xs">
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('feedback:title')}
          </Text>
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
                className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
              >
                <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                  {t('feedback:submitAnother')}
                </Text>
              </PressableScale>
            </View>
          </SuccessPop>
        ) : (
          <View className="gap-lg rounded-lg border border-neutral-200 bg-white p-lg">
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
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-sm">
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
              maxLength={2000}
              style={styles.message}
            />
            {image === null ? null : (
              <Image
                source={{ uri: image.uri }}
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
              label={createFeedback.isPending ? t('feedback:sending') : t('feedback:submit')}
              onPress={() => void submit()}
              isLoading={createFeedback.isPending}
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
            <ActivityIndicator accessibilityLabel={t('common:loading')} />
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
          {feedbackQuery.data?.map((submission) => (
            <View
              key={submission.id}
              testID={`feedback-history-${submission.id}`}
              className="gap-xs rounded-lg border border-neutral-200 bg-white p-lg"
              style={continuousCorners}
            >
              <Text
                className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t(`feedback:${typeKey[submission.type]}`)}
              </Text>
              <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
                {submission.content}
              </Text>
              <Text className={`text-start text-sm font-medium text-primary ${languageFontClass}`}>
                {t(`feedback:${statusKey[submission.status]}`)} ·{' '}
                {dateFormatter.format(new Date(submission.createdAt))}
              </Text>
            </View>
          ))}
        </View>
      </FormWidth>
    </ScrollView>
  );
}
