import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { FailureNotice } from '@/components/error-code-line';
import { FieldLabel } from '@/components/forms/field-label';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { FormWidth } from '@/components/layout/content-width';
import { RaisedChip } from '@/components/layout/filter-chips';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { OpenableCard } from '@/components/layout/openable-card';
import { ActionScreen } from '@/components/layout/screen-action';
import { ScreenSection } from '@/components/layout/screen-section';
import { MentoringPreferencePickers } from '@/components/mentoring/mentoring-preference-pickers';
import { SuccessPop } from '@/components/motion/success-pop';
import { continuousCorners } from '@/lib/continuous-corners';
import { MENTORING_STATUS_KEYS, MENTORING_TOPIC_KEYS } from '@/lib/mentoring-labels';
import { useCreateMentoringRequest, usePlayerMentoringRequests } from '@/lib/player-mentoring';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import {
  MENTORING_TOPICS,
  mentoringRequestSchema,
  type MentoringRequest,
  type MentoringTopic,
} from '@ramassa/shared/mentoring';
import { tokens } from '@ramassa/shared/tokens';

const MENTORING_DETAIL_MAX_LENGTH = 2_000;
const DETAIL_INPUT_VISIBLE_LINES = 5;
const EMPTY_MENTORING_REQUESTS: readonly MentoringRequest[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  content: { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.lg },
  detailInput: { minHeight: tokens.spacing['3xl'] * 2, writingDirection: 'auto' },
  mixedDirectionText: { writingDirection: 'auto' },
});

const topicKey = MENTORING_TOPIC_KEYS;
const statusKey = MENTORING_STATUS_KEYS;

export default function MentoringScreen() {
  const { t, i18n } = useTranslation(['mentoring', 'common']);
  const languageFontClass = useLanguageFontClass();
  const requestsQuery = usePlayerMentoringRequests();
  const refetchRequests = requestsQuery.refetch;
  const {
    error: createError,
    isPending: isCreatePending,
    mutateAsync: createRequestAsync,
  } = useCreateMentoringRequest();
  const [topic, setTopic] = useState<MentoringTopic>('personal_development');
  const [topicDetail, setTopicDetail] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [localErrorCode, setLocalErrorCode] = useState<AppErrorCode | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const mutationCode = createError === null ? null : toAppError(createError).code;
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
      await createRequestAsync(parsed.data);
      setTopic('personal_development');
      setTopicDetail('');
      setPreferredDate('');
      setPreferredTime('');
      setIsComplete(true);
    } catch {
      return;
    }
  }, [createRequestAsync, preferredDate, preferredTime, topic, topicDetail]);

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
  const screenTitle = t('mentoring:title');
  const retryRequests = useCallback(() => void refetchRequests(), [refetchRequests]);
  const requests = requestsQuery.data ?? EMPTY_MENTORING_REQUESTS;
  // Her requests come first, and only when she has some (RAPP-900): what she
  // is waiting on matters before a new request, and a first visit opens on
  // the form.
  const hasRequests = requests.length > 0;
  const requestsFailed = requestsQuery.isError && requestsQuery.data === undefined;
  return (
    <ActionScreen
      className="bg-neutral-50"
      action={
        !isComplete ? (
          <AuthSubmitButton
            testID="mentoring-submit"
            label={isCreatePending ? t('mentoring:submitting') : t('mentoring:submit')}
            isLoading={isCreatePending}
            onPress={() => void submit()}
          />
        ) : null
      }
    >
      <NativeScreenHeader title={screenTitle} />
      <ScrollView
        testID="mentoring-screen"
        style={styles.screen}
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <FormWidth className="gap-lg">
          {hasRequests || requestsFailed ? (
            <ScreenSection title={t('mentoring:statusTitle')}>
              {requestsFailed ? (
                <View className="gap-sm">
                  <FailureNotice
                    code={toAppError(requestsQuery.error).code}
                    message={t('mentoring:loadFailed')}
                  />
                  <RaisedActionButton label={t('mentoring:retry')} onPress={retryRequests} />
                </View>
              ) : (
                <View className="gap-md">
                  {requests.map((request) => (
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
            </ScreenSection>
          ) : null}

          <View className="gap-xs">
            <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
              {t('mentoring:intro')}
            </Text>
          </View>

          <View
            accessibilityRole="summary"
            className="gap-xs rounded-lg border border-primary/30 bg-primary/5 p-lg"
            style={continuousCorners}
          >
            <Text className={`text-start text-lg font-bold text-primary-dark ${languageFontClass}`}>
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
                <RaisedActionButton
                  label={t('mentoring:submitAnother')}
                  onPress={() => setIsComplete(false)}
                />
              </View>
            </SuccessPop>
          ) : (
            <ScreenSection title={t('mentoring:newRequestTitle')} isLast>
              <View className="gap-sm">
                <FieldLabel>{t('mentoring:topicLabel')}</FieldLabel>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('mentoring:topicLabel')}
                  className="flex-row flex-wrap gap-sm"
                >
                  {MENTORING_TOPICS.map((option) => (
                    <RaisedChip
                      key={option}
                      testID={`mentoring-topic-${option}`}
                      label={t(`mentoring:${topicKey[option]}`)}
                      isSelected={topic === option}
                      onPress={() => setTopic(option)}
                      languageFontClass={languageFontClass}
                    />
                  ))}
                </View>
              </View>
              <AuthTextField
                testID="mentoring-detail"
                label={t('mentoring:detailLabel')}
                placeholder={t('mentoring:detailPlaceholder')}
                value={topicDetail}
                maxLength={MENTORING_DETAIL_MAX_LENGTH}
                multiline
                numberOfLines={DETAIL_INPUT_VISIBLE_LINES}
                textAlignVertical="top"
                style={styles.detailInput}
                onChangeText={setTopicDetail}
              />
              <MentoringPreferencePickers
                preferredDate={preferredDate}
                preferredTime={preferredTime}
                onPreferredDateChange={setPreferredDate}
                onPreferredTimeChange={setPreferredTime}
              />
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
            </ScreenSection>
          )}
        </FormWidth>
      </ScrollView>
    </ActionScreen>
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
  const { push } = useRouter();
  const status = t(statusKey[request.status]);
  const topicLabel = t(topicKey[request.topic]);
  const requestedOn = t('requestedOn', { date: dateFormatter.format(new Date(request.createdAt)) });
  const openDetail = useCallback(
    () => push(`/mentoring/${request.id}` as Href),
    [push, request.id],
  );
  return (
    <OpenableCard
      testID={`mentoring-request-${request.id}`}
      accessibilityLabel={[status, topicLabel, requestedOn].join('. ')}
      onOpen={openDetail}
    >
      <Text className={`text-start text-md font-bold text-primary ${languageFontClass}`}>
        {status}
      </Text>
      <Text className={`text-start text-md font-semibold text-neutral-900 ${languageFontClass}`}>
        {topicLabel}
      </Text>
      <Text className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}>
        {requestedOn}
      </Text>
      {request.scheduledAt === null ? null : (
        <Text
          className={`text-start text-sm font-medium tabular-nums text-neutral-800 ${languageFontClass}`}
        >
          {dateTimeFormatter.format(new Date(request.scheduledAt))}
        </Text>
      )}
      {request.assignedStaffName === null ? null : (
        <Text
          style={styles.mixedDirectionText}
          className={`text-start text-sm text-neutral-600 ${languageFontClass}`}
        >
          {t('assignedTo', { name: request.assignedStaffName })}
        </Text>
      )}
    </OpenableCard>
  );
}
