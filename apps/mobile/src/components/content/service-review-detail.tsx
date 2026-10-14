/**
 * One item of the service review queue (RAPP-345), as the web admin's review
 * page has it.
 *
 * A pending submission shows the service as the entity sent it. "Review and
 * publish" opens it in the service form in approval mode, where the reviewer
 * corrects it, approves its translations and adds an optional comment.
 * Rejecting needs a comment the entity reads; the entity can then correct the
 * service and send it again, which is how changes are asked for.
 *
 * A change an entity made to a live service shows each changed field, before
 * and now, as text (the web admin shows raw JSON), and "Mark as reviewed".
 * Both have the comment thread: comments the entity sees, or internal notes.
 */
import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useServiceReview, useServiceReviewActions } from '@/lib/content-service-reviews';
import { useContentServiceCategories } from '@/lib/content-services';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@ramassa/shared/i18n';
import {
  diffServiceSnapshots,
  type AdminServiceCategory,
  type ServiceSnapshotDiff,
} from '@ramassa/shared/services';
import type {
  ServiceSubmissionComment,
  StaffServiceCommentVisibility,
} from '@ramassa/shared/services/entity';
import { ServiceFacts } from './service-detail';
import {
  fieldLabel,
  formatMetadataValue,
  SERVICE_AVAILABILITY_KEYS,
  SERVICE_COST_KEYS,
} from './service-labels';
import { parseReviewKey } from './service-review-list';

const DIFF_LABEL_KEYS = {
  availability: 'fieldAvailability',
  category_id: 'fieldCategory',
  contact_email: 'fieldContactEmail',
  contact_name: 'fieldContactName',
  contact_phone: 'fieldContactPhone',
  contact_role: 'fieldContactRole',
  cost_amount: 'fieldCostAmount',
  cost_details: 'fieldCostDetails',
  cost_type: 'fieldCostType',
  description: 'fieldDescription',
  expires_at: 'expiresAt',
  external_url: 'fieldExternalUrl',
  location: 'fieldLocation',
  metadata: 'fieldsTitle',
  provider_name: 'fieldProviderName',
  published_at: 'publishedAt',
  schedule: 'fieldSchedule',
  title: 'fieldTitle',
  zone: 'fieldZone',
} as const satisfies Record<ServiceSnapshotDiff['field'], string>;

const VISIBILITIES: readonly StaffServiceCommentVisibility[] = ['public', 'internal'];

function useDiffValue(categories: readonly AdminServiceCategory[] | undefined) {
  const { t, i18n } = useTranslation('services');
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [language],
  );
  return (field: ServiceSnapshotDiff['field'], value: unknown, categoryId: unknown): string => {
    if (value === null || value === undefined || value === '') return '·';
    if (field === 'title' || field === 'description') {
      const localized = value as Readonly<Record<string, unknown>>;
      return typeof localized.ca === 'string' ? localized.ca : JSON.stringify(value);
    }
    if (field === 'category_id') {
      const found = categories?.find((category) => category.id === value);
      return found === undefined ? String(value) : (found.name[language] ?? found.name.ca);
    }
    if (field === 'cost_type' && typeof value === 'string' && value in SERVICE_COST_KEYS) {
      return t(SERVICE_COST_KEYS[value as keyof typeof SERVICE_COST_KEYS]);
    }
    if (
      field === 'availability' &&
      typeof value === 'string' &&
      value in SERVICE_AVAILABILITY_KEYS
    ) {
      return t(SERVICE_AVAILABILITY_KEYS[value as keyof typeof SERVICE_AVAILABILITY_KEYS]);
    }
    if ((field === 'published_at' || field === 'expires_at') && typeof value === 'string') {
      return format.format(new Date(value));
    }
    if (field === 'metadata' && typeof value === 'object') {
      const category = categories?.find((candidate) => candidate.id === categoryId);
      const values = value as Readonly<Record<string, unknown>>;
      const lines = (category?.definition.fields ?? []).flatMap((definition) => {
        const text = formatMetadataValue(definition, values[definition.key], t);
        return text === null ? [] : [`${fieldLabel(definition, language)}: ${text}`];
      });
      return lines.length === 0 ? '·' : lines.join('\n');
    }
    return String(value);
  };
}

function Thread({
  serviceId,
  comments,
}: {
  readonly serviceId: string;
  readonly comments: readonly ServiceSubmissionComment[];
}) {
  const { t, i18n } = useTranslation('services');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { comment } = useServiceReviewActions();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<StaffServiceCommentVisibility>('public');
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.resolvedLanguage],
  );
  return (
    <View
      testID="service-review-thread"
      style={continuousCorners}
      className="gap-sm rounded-md border border-neutral-200 bg-white p-md"
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
      >
        {t('reviewThreadTitle')}
      </Text>
      {comments.length === 0 ? (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('reviewThreadEmpty')}
        </Text>
      ) : (
        comments.map((item) => (
          <View
            key={item.id}
            testID={`service-review-comment-${item.id}`}
            style={continuousCorners}
            className="gap-xs rounded-md bg-neutral-50 p-sm"
          >
            <Text className={`text-start text-sm font-semibold text-neutral-600 ${fontClass}`}>
              {`${
                item.isInternal
                  ? t('reviewCommentInternal')
                  : item.authorRole === 'entity'
                    ? t('reviewCommentEntity')
                    : t('reviewCommentStaff')
              } · ${format.format(new Date(item.createdAt))}`}
            </Text>
            <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
              {item.body}
            </Text>
          </View>
        ))
      )}
      <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
        {t('reviewCommentVisibility')}
      </Text>
      <View className="flex-row flex-wrap gap-sm">
        {VISIBILITIES.map((candidate) => (
          <ChoiceOption
            key={candidate}
            testID={`service-review-visibility-${candidate}`}
            value={candidate}
            label={
              candidate === 'public' ? t('reviewVisibilityPublic') : t('reviewVisibilityInternal')
            }
            selected={candidate === visibility}
            onSelect={setVisibility}
            languageFontClass={fontClass}
          />
        ))}
      </View>
      <AuthTextField
        testID="service-review-comment-body"
        label={t('reviewCommentPlaceholder')}
        value={body}
        onChangeText={setBody}
        maxLength={4_000}
        multiline
      />
      {comment.isError ? (
        <FailureNotice
          code={toAppError(comment.error).code}
          message={tErrors(getErrorMessageKey(toAppError(comment.error).code))}
        />
      ) : null}
      <PressableScale
        testID="service-review-comment-send"
        accessibilityRole="button"
        accessibilityLabel={t('reviewCommentSend')}
        onPress={() =>
          comment.mutate(
            { serviceId, body, visibility },
            {
              onSuccess: () => {
                playHaptic('success');
                setBody('');
              },
            },
          )
        }
        isBusy={comment.isPending}
        isDisabled={body.trim().length === 0}
        haptic="tapLight"
        style={continuousCorners}
        className="min-h-recommended items-center justify-center self-start rounded-md border border-primary bg-white px-lg"
      >
        <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
          {comment.isPending ? t('reviewCommentSending') : t('reviewCommentSend')}
        </Text>
      </PressableScale>
    </View>
  );
}

export function ServiceReviewDetail({
  reviewKey,
  onBack,
  onDone,
}: {
  readonly reviewKey: string;
  readonly onBack?: () => void;
  /** After a rejection or "mark as reviewed": the item has left the queue. */
  readonly onDone: () => void;
}) {
  const { t } = useTranslation('services');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { serviceId, notificationId } = parseReviewKey(reviewKey);
  const review = useServiceReview(serviceId, notificationId);
  const categories = useContentServiceCategories();
  const { reject, markReviewed } = useServiceReviewActions();
  const [rejection, setRejection] = useState('');
  const diffValue = useDiffValue(categories.data);

  if (review.isPending) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('reviewQueueTitle')} />;
  }
  if (review.isError || review.data === undefined) {
    return (
      <AnnouncementFeedError
        message={t('reviewLoadFailed')}
        retryLabel={tErrors('retry')}
        code={toAppError(review.error).code}
        languageFontClass={fontClass}
        onRetry={() => void review.refetch()}
        isLoading={review.isFetching}
      />
    );
  }
  const { detail, comments, notification } = review.data;
  const { service, images } = detail;
  const category = categories.data?.find((candidate) => candidate.id === service.category_id);
  const changes =
    notification === null
      ? []
      : diffServiceSnapshots(notification.previousService, notification.currentService);
  const failure = reject.error ?? markReviewed.error;

  return (
    <ScrollView
      contentContainerClassName="gap-md p-lg"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      testID="service-review-detail"
    >
      {onBack === undefined ? null : (
        <PressableScale
          accessibilityLabel={tCommon('back')}
          onPress={onBack}
          haptic="tapLight"
          className="min-h-recommended self-start justify-center"
        >
          <Text className={`font-semibold text-primary-dark ${fontClass}`}>{tCommon('back')}</Text>
        </PressableScale>
      )}
      <View className="gap-xs">
        <Text className={`text-start text-sm font-semibold text-neutral-600 ${fontClass}`}>
          {t('reviewDetailEyebrow')}
        </Text>
        <Text
          accessibilityRole="header"
          className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
        >
          {service.title.ca}
        </Text>
        <Text className={`text-start text-sm font-semibold text-neutral-700 ${fontClass}`}>
          {notification === null ? t('reviewKindPending') : t('reviewKindPublishedEdit')}
        </Text>
      </View>

      {failure === null ? null : (
        <FailureNotice
          code={toAppError(failure).code}
          message={tErrors(getErrorMessageKey(toAppError(failure).code))}
        />
      )}

      {notification === null ? (
        <>
          <PressableScale
            testID="service-review-approve"
            accessibilityRole="button"
            accessibilityLabel={t('reviewApproveAction')}
            onPress={() => push(`/content-service-approve/${service.id}` as Href)}
            isDisabled={service.status !== 'pending'}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center self-start rounded-md bg-primary px-lg"
          >
            <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
              {t('reviewApproveAction')}
            </Text>
          </PressableScale>
          <ServiceFacts service={service} images={images} category={category} />
          <View
            style={continuousCorners}
            className="gap-sm rounded-md border border-error bg-white p-md"
          >
            <Text
              accessibilityRole="header"
              className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
            >
              {t('reviewRejectTitle')}
            </Text>
            <AuthTextField
              testID="service-review-rejection-comment"
              label={t('reviewRejectComment')}
              value={rejection}
              onChangeText={setRejection}
              maxLength={4_000}
              multiline
            />
            <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
              {t('reviewRejectHelp')}
            </Text>
            <PressableScale
              testID="service-review-reject"
              accessibilityRole="button"
              accessibilityLabel={t('reviewReject')}
              onPress={() =>
                reject.mutate(
                  { serviceId: service.id, comment: rejection },
                  {
                    onSuccess: () => {
                      playHaptic('success');
                      onDone();
                    },
                    onError: () => playHaptic('error'),
                  },
                )
              }
              isBusy={reject.isPending}
              isDisabled={rejection.trim().length === 0 || service.status !== 'pending'}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center self-start rounded-md border border-error bg-white px-lg"
            >
              <Text className={`text-center text-md font-bold text-error ${fontClass}`}>
                {reject.isPending ? t('reviewRejecting') : t('reviewReject')}
              </Text>
            </PressableScale>
          </View>
        </>
      ) : (
        <View
          testID="service-review-diff"
          style={continuousCorners}
          className="gap-sm rounded-md border border-neutral-200 bg-white p-md"
        >
          <Text
            accessibilityRole="header"
            className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
          >
            {t('reviewDiffTitle')}
          </Text>
          {changes.length === 0 ? (
            <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
              {t('reviewDiffEmpty')}
            </Text>
          ) : (
            changes.map((change) => (
              <View
                key={change.field}
                testID={`service-review-change-${change.field}`}
                className="gap-xs border-t border-neutral-200 pt-sm"
              >
                <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
                  {t(DIFF_LABEL_KEYS[change.field])}
                </Text>
                <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                  {`${t('reviewPrevious')}: ${diffValue(
                    change.field,
                    change.previous,
                    notification.previousService.category_id,
                  )}`}
                </Text>
                <Text className={`text-start text-md text-neutral-900 ${fontClass}`}>
                  {`${t('reviewCurrent')}: ${diffValue(
                    change.field,
                    change.current,
                    notification.currentService.category_id,
                  )}`}
                </Text>
              </View>
            ))
          )}
          {notification.readAt === null ? (
            <PressableScale
              testID="service-review-mark-reviewed"
              accessibilityRole="button"
              accessibilityLabel={t('reviewMarkReviewed')}
              onPress={() =>
                markReviewed.mutate(notification.id, {
                  onSuccess: () => {
                    playHaptic('success');
                    onDone();
                  },
                })
              }
              isBusy={markReviewed.isPending}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center self-start rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                {markReviewed.isPending ? t('reviewMarking') : t('reviewMarkReviewed')}
              </Text>
            </PressableScale>
          ) : (
            <Text className={`text-start text-sm font-semibold text-success ${fontClass}`}>
              {t('reviewDone')}
            </Text>
          )}
        </View>
      )}
      <Thread serviceId={service.id} comments={comments} />
    </ScrollView>
  );
}
