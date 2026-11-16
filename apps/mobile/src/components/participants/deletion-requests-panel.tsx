/**
 * Participants' open deletion requests (RAPP-286), for `rgpd.erase` holders:
 * whose request it is, her reason, and when she asked. Each opens her record,
 * where the GDPR actions are, as on the web admin. One implementation for the
 * Peticions d'esborrat segment of Participants and the `/deletion-requests`
 * route (RAPP-798).
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useOpenDeletionRequests } from '@/lib/rgpd';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';

export function DeletionRequestsPanel({
  onOpenParticipant,
}: {
  /** A phone pushes her card; the tablet opens it beside the list. */
  readonly onOpenParticipant: (participantId: string) => void;
}) {
  const { t, i18n } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  const requests = useOpenDeletionRequests();
  const formatDate = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: MADRID_TIME_ZONE,
    });
    return (value: string) => format.format(new Date(value));
  }, [i18n.resolvedLanguage]);
  const rows = requests.data ?? [];

  if (requests.isPending) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('deletionRequestsTitle')} />;
  }
  if (requests.isError) {
    return <Text className={`text-start text-md text-error ${fontClass}`}>{t('loadFailed')}</Text>;
  }
  if (rows.length === 0) {
    return (
      <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
        {t('deletionRequestsEmpty')}
      </Text>
    );
  }
  return (
    <View className="gap-sm">
      {rows.map((request) => {
        const fullName =
          request.participant === null
            ? null
            : `${request.participant.first_name} ${request.participant.last_name}`.trim();
        // An anonymized record keeps her request but has no name to show.
        const name =
          fullName === null
            ? request.profile_id
            : fullName === ''
              ? t('profile.anonymizedName')
              : fullName;
        return (
          <View
            key={request.id}
            testID={`deletion-request-${request.id}`}
            style={continuousCorners}
            className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
          >
            <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
              {name}
            </Text>
            <Text className={`text-start text-sm text-neutral-800 ${fontClass}`}>
              {request.reason === null || request.reason.trim() === ''
                ? t('deletionRequestNoReason')
                : request.reason}
            </Text>
            <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
              {`${t('deletionRequestColumnCreated')}: ${formatDate(request.created_at)}`}
            </Text>
            <PressableScale
              testID={`deletion-request-open-${request.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('deletionRequestOpen')}
              onPress={() => onOpenParticipant(request.profile_id)}
              haptic="tapLight"
              className="min-h-recommended self-start justify-center"
            >
              <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                {t('deletionRequestOpen')}
              </Text>
            </PressableScale>
          </View>
        );
      })}
    </View>
  );
}
