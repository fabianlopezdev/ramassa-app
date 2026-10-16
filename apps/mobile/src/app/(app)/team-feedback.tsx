/**
 * The feedback inbox on the phone (RAPP-383), for `feedback.view` holders, as
 * the web admin's inbox: how many of each kind arrived per month, filters by
 * kind and status, and each submission with who sent it, when, its text and
 * photo. It moves on to read, in progress or resolved, and whoever has the
 * inbox answers in the chat it opened.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { nextFeedbackStatuses } from '@/lib/feedback-status';
import { playHaptic } from '@/lib/haptics/haptics';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import {
  useFeedbackMonthlyCounts,
  useFeedbackTransition,
  useStaffFeedback,
} from '@/lib/team-feedback';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  type FeedbackStatus,
  type FeedbackType,
  type StaffFeedbackSubmission,
} from '@ramassa/shared/feedback';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';

const TYPE_KEYS: Readonly<Record<FeedbackType, string>> = {
  activity_proposal: 'typeActivityProposal',
  idea: 'typeIdea',
  problem: 'typeProblem',
  general: 'typeGeneral',
};
const STATUS_KEYS: Readonly<Record<FeedbackStatus, string>> = {
  new: 'statusNew',
  read: 'statusRead',
  in_progress: 'statusInProgress',
  resolved: 'statusResolved',
};
const ACTION_KEYS: Readonly<Record<Exclude<FeedbackStatus, 'new'>, string>> = {
  read: 'markRead',
  in_progress: 'markInProgress',
  resolved: 'markResolved',
};
const MONTHS_SHOWN = 8;
const styles = StyleSheet.create({ photo: { width: '100%', aspectRatio: 4 / 3 } });

function SubmissionCard({
  submission,
  date,
  canChat,
}: {
  readonly submission: StaffFeedbackSubmission;
  readonly date: string;
  readonly canChat: boolean;
}) {
  const { t } = useTranslation('feedback');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { session } = useAuth();
  const { push } = useRouter();
  const transition = useFeedbackTransition();
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const photo = resolveMediaImageSource({
    objectKeyOrUrl: submission.imageObjectKey,
    mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
    accessToken: session?.access_token,
  });

  return (
    <View
      testID={`feedback-submission-${submission.id}`}
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <View className="flex-row flex-wrap items-start justify-between gap-sm">
        <View className="flex-1 gap-xs">
          <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
            {`${submission.authorFirstName} ${submission.authorLastName}`.trim()}
          </Text>
          <Text className={`text-start text-sm tabular-nums text-neutral-600 ${fontClass}`}>
            {date}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-xs">
          <View className="rounded-full bg-neutral-100 px-sm py-xs">
            <Text className={`text-sm font-semibold text-neutral-800 ${fontClass}`}>
              {t(TYPE_KEYS[submission.type])}
            </Text>
          </View>
          <View className="rounded-full border border-neutral-300 px-sm py-xs">
            <Text
              testID={`feedback-status-${submission.id}`}
              className={`text-sm font-semibold text-neutral-800 ${fontClass}`}
            >
              {t(STATUS_KEYS[submission.status])}
            </Text>
          </View>
        </View>
      </View>
      <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
        {submission.content}
      </Text>
      {photo === null ? null : (
        <View style={[styles.photo, continuousCorners]} className="overflow-hidden bg-neutral-100">
          <Image
            source={photo}
            accessibilityLabel={t(TYPE_KEYS[submission.type])}
            contentFit="cover"
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}
      <View className="flex-row flex-wrap gap-sm">
        {nextFeedbackStatuses(submission.status).map((status) => (
          <PressableScale
            key={status}
            testID={`feedback-${status}-${submission.id}`}
            accessibilityRole="button"
            accessibilityLabel={t(ACTION_KEYS[status])}
            onPress={() =>
              transition.mutate(
                { submissionId: submission.id, status },
                {
                  onSuccess: () => {
                    playHaptic('success');
                    setErrorCode(null);
                  },
                  onError: (error) => {
                    playHaptic('error');
                    setErrorCode(toAppError(error).code);
                  },
                },
              )
            }
            isBusy={transition.isPending && transition.variables?.status === status}
            isDisabled={transition.isPending}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-md"
          >
            <Text className={`text-center text-md font-semibold text-primary-dark ${fontClass}`}>
              {t(ACTION_KEYS[status])}
            </Text>
          </PressableScale>
        ))}
        {canChat ? (
          <PressableScale
            testID={`feedback-chat-${submission.id}`}
            accessibilityRole="button"
            accessibilityLabel={t('respondChat')}
            onPress={() => push(`/messages/${submission.conversationId}` as Href)}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md bg-primary px-md"
          >
            <Text className={`text-center text-md font-semibold text-white ${fontClass}`}>
              {t('respondChat')}
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {errorCode === null ? null : (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${fontClass}`}
        >
          {tErrors(errorCode)}
        </Text>
      )}
    </View>
  );
}

export default function TeamFeedbackScreen() {
  const { t, i18n } = useTranslation('feedback');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const canChat = useAccountAccess().permissions.has('messages.inbox');
  const submissions = useStaffFeedback();
  const monthly = useFeedbackMonthlyCounts();
  const [type, setType] = useState<'all' | FeedbackType>('all');
  const [status, setStatus] = useState<'all' | FeedbackStatus>('all');
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const monthFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        month: 'long',
        year: 'numeric',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const visible = useMemo(
    () =>
      (submissions.data ?? []).filter(
        (submission) =>
          (type === 'all' || submission.type === type) &&
          (status === 'all' || submission.status === status),
      ),
    [status, submissions.data, type],
  );

  return (
    <SafeAreaView
      testID="team-feedback"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="team-feedback-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('inboxTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('inboxIntro')}
            </Text>
          </View>
          {(monthly.data ?? []).length === 0 ? null : (
            <View className="gap-sm">
              <Text
                accessibilityRole="header"
                className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
              >
                {t('monthlyTitle')}
              </Text>
              <View testID="team-feedback-monthly" className="flex-row flex-wrap gap-sm">
                {(monthly.data ?? []).slice(0, MONTHS_SHOWN).map((item) => (
                  <View
                    key={`${item.month}-${item.type}`}
                    style={continuousCorners}
                    className="gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
                  >
                    <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                      {monthFormat.format(new Date(`${item.month.slice(0, 7)}-15T12:00:00Z`))}
                    </Text>
                    <Text
                      className={`text-start text-sm font-medium text-neutral-800 ${fontClass}`}
                    >
                      {t(TYPE_KEYS[item.type])}
                    </Text>
                    <Text
                      className={`text-start text-xl font-bold tabular-nums text-primary-dark ${fontClass}`}
                    >
                      {item.count}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View className="gap-sm">
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('filterType')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-sm">
                {(['all', ...FEEDBACK_TYPES] as const).map((candidate) => (
                  <ChoiceOption
                    key={candidate}
                    testID={`team-feedback-type-${candidate}`}
                    value={candidate}
                    label={candidate === 'all' ? t('filterAll') : t(TYPE_KEYS[candidate])}
                    selected={candidate === type}
                    onSelect={setType}
                    languageFontClass={fontClass}
                  />
                ))}
              </View>
            </ScrollView>
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('filterStatus')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-sm">
                {(['all', ...FEEDBACK_STATUSES] as const).map((candidate) => (
                  <ChoiceOption
                    key={candidate}
                    testID={`team-feedback-status-${candidate}`}
                    value={candidate}
                    label={candidate === 'all' ? t('filterAll') : t(STATUS_KEYS[candidate])}
                    selected={candidate === status}
                    onSelect={setStatus}
                    languageFontClass={fontClass}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
          {submissions.isPending ? (
            <AnnouncementFeedSkeleton accessibilityLabel={t('inboxTitle')} />
          ) : submissions.isError ? (
            <Text className={`text-start text-md text-error ${fontClass}`}>
              {toAppError(submissions.error).code}
            </Text>
          ) : visible.length === 0 ? (
            <Text className={`py-xl text-center text-md text-neutral-600 ${fontClass}`}>
              {t('inboxEmpty')}
            </Text>
          ) : (
            <View className="gap-md">
              {visible.map((submission) => (
                <SubmissionCard
                  key={submission.id}
                  submission={submission}
                  date={format.format(new Date(submission.createdAt))}
                  canChat={canChat}
                />
              ))}
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
