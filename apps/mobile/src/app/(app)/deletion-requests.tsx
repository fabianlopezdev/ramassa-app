/**
 * Participants' open deletion requests on the phone (RAPP-286), for `rgpd.erase`
 * holders: whose request it is, her reason, and when she asked. Each opens her
 * record, where the GDPR actions are, as on the web admin.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useOpenDeletionRequests } from '@/lib/rgpd';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';

export default function DeletionRequestsScreen() {
  const { t, i18n } = useTranslation('participants');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back, push } = useRouter();
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

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="deletion-requests-back"
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
              {t('deletionRequestsTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('deletionRequestsHint')}
            </Text>
          </View>
          {requests.isPending ? (
            <AnnouncementFeedSkeleton accessibilityLabel={t('deletionRequestsTitle')} />
          ) : requests.isError ? (
            <Text className={`text-start text-md text-error ${fontClass}`}>{t('loadFailed')}</Text>
          ) : rows.length === 0 ? (
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('deletionRequestsEmpty')}
            </Text>
          ) : (
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
                    <Text
                      className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}
                    >
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
                      onPress={() => push(`/participant/${request.profile_id}` as Href)}
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
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
