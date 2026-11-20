/**
 * Mentoring requests on the phone (RAPP-382), for `mentoring.manage` holders,
 * as the web admin's queue: how many requests and on which topics, and each
 * request with its private note and preferred slot. An open request is
 * scheduled with a time in Madrid, the team member who meets her and the
 * team's private notes, which tells her; a scheduled one can be updated or
 * marked completed.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { DateTimeField } from '@/components/content/date-time-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { Badge } from '@/components/layout/badge';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ScreenSection } from '@/components/layout/screen-section';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import {
  MENTORING_STATUS_KEYS,
  MENTORING_TOPIC_KEYS,
  preferredSlotParts,
} from '@/lib/mentoring-labels';
import {
  useMentoringActions,
  useMentoringStaff,
  useStaffMentoringRequests,
} from '@/lib/team-mentoring';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { summarizeMentoringTopics, type StaffMentoringRequest } from '@ramassa/shared/mentoring';
import type { ConversationStaffMember } from '@ramassa/shared/messaging';

function preferredSlot(
  request: StaffMentoringRequest,
  language: string,
  noPreference: string,
): string {
  const parts = preferredSlotParts(request, language);
  if (parts === null) return noPreference;
  return parts.time === null ? parts.date : `${parts.date}, ${parts.time}`;
}

function RequestCard({
  request,
  staff,
  language,
}: {
  readonly request: StaffMentoringRequest;
  readonly staff: readonly ConversationStaffMember[];
  readonly language: string;
}) {
  const { t } = useTranslation('mentoring');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { schedule, complete } = useMentoringActions();
  const [scheduledAt, setScheduledAt] = useState<string | null>(request.scheduledAt);
  const [picked, setAssignee] = useState(request.assignedStaffId ?? '');
  // The first team member until she picks one, as the web admin does.
  const assignee = picked.length > 0 ? picked : (staff[0]?.id ?? '');
  const [notes, setNotes] = useState(request.staffNotes ?? '');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const isOpen = request.status === 'requested' || request.status === 'scheduled';
  const isSaving = schedule.isPending || complete.isPending;
  const requestedAt = new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: MADRID_TIME_ZONE,
  }).format(new Date(request.createdAt));

  const onDone = {
    onSuccess: () => {
      playHaptic('success');
      setErrorCode(null);
    },
    onError: (error: unknown) => {
      playHaptic('error');
      setErrorCode(toAppError(error).code);
    },
  };

  return (
    <View
      testID={`mentoring-request-${request.id}`}
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <View className="flex-row flex-wrap items-start justify-between gap-sm">
        <View className="flex-1 gap-xs">
          <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
            {t('adminPlayer', { name: `${request.playerFirstName} ${request.playerLastName}` })}
          </Text>
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('adminRequested', { date: requestedAt })}
          </Text>
        </View>
        <Badge
          testID={`mentoring-status-${request.id}`}
          label={t(MENTORING_STATUS_KEYS[request.status])}
          languageFontClass={fontClass}
        />
      </View>
      <View style={continuousCorners} className="gap-xs rounded-md bg-neutral-50 p-md">
        <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
          {t(MENTORING_TOPIC_KEYS[request.topic])}
        </Text>
        {request.topicDetail === null ? null : (
          <>
            <Text className={`text-start text-sm font-semibold text-neutral-600 ${fontClass}`}>
              {t('adminRequestDetail')}
            </Text>
            <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
              {request.topicDetail}
            </Text>
          </>
        )}
        <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
          {t('adminPreferred', {
            value: preferredSlot(request, language, t('adminNoPreference')),
          })}
        </Text>
      </View>
      {isOpen ? (
        <View className="gap-md">
          <DateTimeField
            testID={`mentoring-schedule-${request.id}`}
            label={t('adminSchedule')}
            value={scheduledAt}
            onChange={setScheduledAt}
            inMadridTime
          />
          <View className="gap-xs">
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('adminAssignee')}
            </Text>
            <View className="flex-row flex-wrap gap-sm">
              {staff.map((member) => (
                <ChoiceOption
                  key={member.id}
                  testID={`mentoring-assignee-${request.id}-${member.id}`}
                  value={member.id}
                  label={`${member.firstName} ${member.lastName}`.trim()}
                  selected={member.id === assignee}
                  onSelect={setAssignee}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
          </View>
          <AuthTextField
            testID={`mentoring-notes-${request.id}`}
            label={t('adminStaffNotes')}
            value={notes}
            onChangeText={setNotes}
            maxLength={2000}
            multiline
          />
          <View className="flex-row flex-wrap gap-sm">
            <PressableScale
              testID={`mentoring-submit-schedule-${request.id}`}
              accessibilityRole="button"
              accessibilityLabel={t(
                request.status === 'scheduled' ? 'adminRescheduleAction' : 'adminScheduleAction',
              )}
              onPress={() => {
                if (scheduledAt === null) return;
                schedule.mutate(
                  {
                    requestId: request.id,
                    scheduledAt,
                    assignedStaffId: assignee,
                    staffNotes: notes,
                  },
                  onDone,
                );
              }}
              isBusy={schedule.isPending}
              isDisabled={isSaving || scheduledAt === null || assignee.length === 0}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                {t(
                  request.status === 'scheduled' ? 'adminRescheduleAction' : 'adminScheduleAction',
                )}
              </Text>
            </PressableScale>
            {request.status === 'scheduled' ? (
              <RaisedActionButton
                testID={`mentoring-complete-${request.id}`}
                label={t('adminCompleteAction')}
                onPress={() => complete.mutate(request.id, onDone)}
                isDisabled={isSaving || complete.isPending}
              />
            ) : null}
          </View>
          {errorCode === null ? null : (
            <Text
              accessibilityLiveRegion="polite"
              className={`text-start text-sm text-error ${fontClass}`}
            >
              {`${t('submitFailed')} ${tErrors(errorCode, { defaultValue: '' })}`.trim()}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function TeamMentoringScreen() {
  const { t, i18n } = useTranslation('mentoring');
  const fontClass = useLanguageFontClass();
  const language = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const requests = useStaffMentoringRequests();
  const staff = useMentoringStaff();
  const rows = useMemo(() => requests.data ?? [], [requests.data]);
  const topics = useMemo(() => summarizeMentoringTopics(rows), [rows]);

  return (
    <SafeAreaView
      testID="team-mentoring"
      className="flex-1 bg-neutral-50"
      edges={['left', 'right']}
    >
      <NativeScreenHeader title={t('adminTitle')} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <View className="gap-xs">
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('adminIntro')}
            </Text>
            {requests.isSuccess ? (
              <Text
                testID="team-mentoring-total"
                className={`text-start text-md font-semibold text-neutral-800 ${fontClass}`}
              >
                {t('adminQueueCount', { count: rows.length })}
              </Text>
            ) : null}
          </View>
          {topics.length === 0 ? null : (
            <ScreenSection title={t('adminTopicBreakdown')}>
              <View className="flex-row flex-wrap gap-sm">
                {topics.map((item) => (
                  <View
                    key={item.topic}
                    style={continuousCorners}
                    className="gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
                  >
                    <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                      {t(MENTORING_TOPIC_KEYS[item.topic])}
                    </Text>
                    <Text
                      className={`text-start text-xl font-bold tabular-nums text-neutral-900 ${fontClass}`}
                    >
                      {item.count}
                    </Text>
                  </View>
                ))}
              </View>
            </ScreenSection>
          )}
          {requests.isPending ? (
            <AnnouncementFeedSkeleton accessibilityLabel={t('adminTitle')} />
          ) : requests.isError ? (
            <Text className={`text-start text-md text-error ${fontClass}`}>
              {t('submitFailed')}
            </Text>
          ) : rows.length === 0 ? (
            <Text className={`py-xl text-center text-md text-neutral-600 ${fontClass}`}>
              {t('adminEmpty')}
            </Text>
          ) : (
            <View className="gap-md">
              {rows.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  staff={staff.data ?? []}
                  language={language}
                />
              ))}
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
