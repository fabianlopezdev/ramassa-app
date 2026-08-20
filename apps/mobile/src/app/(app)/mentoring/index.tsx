import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { FailureNotice } from '@/components/error-code-line';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SuccessPop } from '@/components/motion/success-pop';
import { continuousCorners } from '@/lib/continuous-corners';
import { useCreateMentoringRequest, usePlayerMentoringRequests } from '@/lib/player-mentoring';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  MENTORING_TOPICS,
  mentoringRequestSchema,
  type MentoringRequest,
  type MentoringStatus,
  type MentoringTopic,
} from '@ramassa/shared/mentoring';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({ detailInput: { minHeight: tokens.spacing['3xl'] * 2 } });

const topicKey: Readonly<Record<MentoringTopic, string>> = {
  personal_development: 'topicPersonalDevelopment',
  labor_orientation: 'topicLaborOrientation',
  asylum_rights: 'topicAsylumRights',
  gender_violence: 'topicGenderViolence',
  empowerment: 'topicEmpowerment',
  digital_skills: 'topicDigitalSkills',
  other: 'topicOther',
};

const statusKey: Readonly<Record<MentoringStatus, string>> = {
  requested: 'statusRequested',
  scheduled: 'statusScheduled',
  completed: 'statusCompleted',
  cancelled: 'statusCancelled',
};

export default function MentoringScreen() {
  const { t, i18n } = useTranslation(['mentoring', 'common']);
  const { back } = useRouter();
  const languageFontClass = useLanguageFontClass();
  const requestsQuery = usePlayerMentoringRequests();
  const createRequest = useCreateMentoringRequest();
  const [topic, setTopic] = useState<MentoringTopic>('personal_development');
  const [topicDetail, setTopicDetail] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [localErrorCode, setLocalErrorCode] = useState<AppErrorCode | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Madrid',
      }),
    [i18n.resolvedLanguage],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'medium',
        timeZone: 'Europe/Madrid',
      }),
    [i18n.resolvedLanguage],
  );
  const mutationCode = createRequest.error === null ? null : toAppError(createRequest.error).code;
  const errorCode = localErrorCode ?? mutationCode;

  const submit = useCallback(async () => {
    setLocalErrorCode(null);
    const parsed = mentoringRequestSchema.safeParse({
      topic,
      topicDetail,
      preferredDate,
      preferredTime,
    });
    if (!parsed.success) {
      setLocalErrorCode('VALIDATION-1');
      return;
    }
    try {
      await createRequest.mutateAsync(parsed.data);
      setTopic('personal_development');
      setTopicDetail('');
      setPreferredDate('');
      setPreferredTime('');
      setIsComplete(true);
    } catch {
      return;
    }
  }, [createRequest, preferredDate, preferredTime, topic, topicDetail]);

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

  return (
    <ScrollView
      testID="mentoring-screen"
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
            {t('mentoring:title')}
          </Text>
          <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
            {t('mentoring:intro')}
          </Text>
        </View>

        <View
          accessibilityRole="summary"
          className="gap-xs rounded-lg border border-primary/30 bg-primary/5 p-lg"
          style={continuousCorners}
        >
          <Text className={`text-start text-lg font-bold text-primary ${languageFontClass}`}>
            {t('mentoring:privacyTitle')}
          </Text>
          <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
            {t('mentoring:privacyBody')}
          </Text>
        </View>

        {isComplete ? (
          <SuccessPop>
            <View
              accessibilityRole="alert"
              testID="mentoring-request-confirmation"
              className="gap-md rounded-lg border border-success bg-white p-lg"
              style={continuousCorners}
            >
              <Text
                accessibilityRole="header"
                className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('mentoring:successTitle')}
              </Text>
              <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
                {t('mentoring:successBody')}
              </Text>
              <PressableScale
                accessibilityLabel={t('mentoring:submitAnother')}
                onPress={() => setIsComplete(false)}
                haptic="tapLight"
                className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
              >
                <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                  {t('mentoring:submitAnother')}
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
              {t('mentoring:newRequestTitle')}
            </Text>
            <View className="gap-sm">
              <Text
                className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}
              >
                {t('mentoring:topicLabel')}
              </Text>
              <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-sm">
                {MENTORING_TOPICS.map((option) => (
                  <PressableScale
                    key={option}
                    testID={`mentoring-topic-${option}`}
                    accessibilityLabel={t(`mentoring:${topicKey[option]}`)}
                    accessibilityRole="radio"
                    isSelected={topic === option}
                    onPress={() => setTopic(option)}
                    haptic="selection"
                    className={`min-h-recommended justify-center rounded-full border px-md ${
                      topic === option ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'
                    }`}
                  >
                    <Text
                      className={`text-md font-medium ${
                        topic === option ? 'text-white' : 'text-neutral-800'
                      } ${languageFontClass}`}
                    >
                      {t(`mentoring:${topicKey[option]}`)}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>
            <AuthTextField
              testID="mentoring-detail"
              label={t('mentoring:detailLabel')}
              placeholder={t('mentoring:detailPlaceholder')}
              value={topicDetail}
              maxLength={2000}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={styles.detailInput}
              onChangeText={setTopicDetail}
            />
            <View className="gap-md sm:flex-row">
              <View className="flex-1">
                <AuthTextField
                  testID="mentoring-preferred-date"
                  label={t('mentoring:preferredDateLabel')}
                  placeholder={t('mentoring:preferredDatePlaceholder')}
                  value={preferredDate}
                  maxLength={10}
                  inputMode="numeric"
                  onChangeText={setPreferredDate}
                />
              </View>
              <View className="flex-1">
                <AuthTextField
                  testID="mentoring-preferred-time"
                  label={t('mentoring:preferredTimeLabel')}
                  placeholder={t('mentoring:preferredTimePlaceholder')}
                  value={preferredTime}
                  maxLength={5}
                  inputMode="numeric"
                  onChangeText={setPreferredTime}
                />
              </View>
            </View>
            {errorCode === null ? null : (
              <FailureNotice
                code={errorCode}
                message={
                  localErrorCode === 'VALIDATION-1'
                    ? t('mentoring:invalidRequest')
                    : t('mentoring:submitFailed')
                }
              />
            )}
            <AuthSubmitButton
              testID="mentoring-submit"
              label={createRequest.isPending ? t('mentoring:submitting') : t('mentoring:submit')}
              isLoading={createRequest.isPending}
              onPress={() => void submit()}
            />
          </View>
        )}

        <View className="gap-md">
          <Text
            accessibilityRole="header"
            className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('mentoring:statusTitle')}
          </Text>
          {requestsQuery.isPending && requestsQuery.data === undefined ? (
            <ActivityIndicator accessibilityLabel={t('mentoring:statusTitle')} />
          ) : requestsQuery.isError && requestsQuery.data === undefined ? (
            <View className="gap-sm">
              <FailureNotice
                code={toAppError(requestsQuery.error).code}
                message={t('mentoring:loadFailed')}
              />
              <PressableScale
                accessibilityLabel={t('mentoring:retry')}
                onPress={() => void requestsQuery.refetch()}
                haptic="tapLight"
                className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
              >
                <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                  {t('mentoring:retry')}
                </Text>
              </PressableScale>
            </View>
          ) : (requestsQuery.data?.length ?? 0) === 0 ? (
            <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
              {t('mentoring:noRequests')}
            </Text>
          ) : (
            <View className="gap-md">
              {requestsQuery.data?.map((request) => (
                <RequestStatusCard
                  key={request.id}
                  request={request}
                  dateTimeFormatter={dateTimeFormatter}
                  dateFormatter={dateFormatter}
                  languageFontClass={languageFontClass}
                />
              ))}
            </View>
          )}
        </View>
      </FormWidth>
    </ScrollView>
  );
}

function RequestStatusCard({
  request,
  dateTimeFormatter,
  dateFormatter,
  languageFontClass,
}: {
  readonly request: MentoringRequest;
  readonly dateTimeFormatter: Intl.DateTimeFormat;
  readonly dateFormatter: Intl.DateTimeFormat;
  readonly languageFontClass: string;
}) {
  const { t } = useTranslation('mentoring');
  return (
    <View
      testID={`mentoring-request-${request.id}`}
      className="gap-xs rounded-lg border border-neutral-200 bg-white p-lg"
      style={continuousCorners}
    >
      <Text className={`text-start text-md font-bold text-primary ${languageFontClass}`}>
        {t(statusKey[request.status])}
      </Text>
      <Text className={`text-start text-md font-semibold text-neutral-900 ${languageFontClass}`}>
        {t(topicKey[request.topic])}
      </Text>
      <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
        {t('requestedOn', { date: dateFormatter.format(new Date(request.createdAt)) })}
      </Text>
      {request.scheduledAt === null ? null : (
        <Text className={`text-start text-sm font-medium text-neutral-800 ${languageFontClass}`}>
          {dateTimeFormatter.format(new Date(request.scheduledAt))}
        </Text>
      )}
      {request.assignedStaffName === null ? null : (
        <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
          {t('assignedTo', { name: request.assignedStaffName })}
        </Text>
      )}
    </View>
  );
}
