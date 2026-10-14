import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SuccessPop } from '@/components/motion/success-pop';
import { ServiceArticle } from '@/components/services/service-article';
import { continuousCorners } from '@/lib/continuous-corners';
import { playErrorHaptic } from '@/lib/haptics/haptics';
import { isNetworkStateOnline } from '@/lib/network-status';
import { safeAsync } from '@/lib/observability';
import {
  usePlayerServiceCategories,
  usePlayerServiceDetail,
  useServiceInterest,
} from '@/lib/player-services';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import * as Linking from 'expo-linking';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t } = useTranslation(['playerServices', 'errors']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const insets = useSafeAreaInsets();
  const serviceQuery = usePlayerServiceDetail(id);
  const categoriesQuery = usePlayerServiceCategories();
  const interest = useServiceInterest();
  const [contactErrorCode, setContactErrorCode] = useState<AppErrorCode | null>(null);
  const interestErrorCode = interest.error === null ? null : toAppError(interest.error).code;
  const service = serviceQuery.data;
  const category = categoriesQuery.data?.find((candidate) => candidate.id === service?.category_id);
  const title = service === undefined ? undefined : resolveLocalizedText(service.title, language);
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
  const openContact = useCallback(async (url: string) => {
    setContactErrorCode(null);
    const result = await safeAsync(() => Linking.openURL(url), {
      code: 'NETWORK-1',
      context: { operation: 'open-service-contact' },
    });
    if (!result.ok) setContactErrorCode(result.error.code);
  }, []);
  const toggleInterest = useCallback(() => {
    if (service !== undefined) {
      interest.mutate({ serviceId: service.id, interested: !service.interested });
    }
  }, [interest, service]);
  useEffect(() => {
    if (interestErrorCode !== null) playErrorHaptic(interestErrorCode);
  }, [interestErrorCode]);

  if (serviceQuery.isPending && serviceQuery.data === undefined) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('playerServices:loading')} />;
  }
  if (serviceQuery.isError && serviceQuery.data === undefined) {
    return (
      <AnnouncementFeedError
        message={t('playerServices:loadFailed')}
        retryLabel={t('playerServices:retry')}
        code={toAppError(serviceQuery.error).code}
        languageFontClass={languageFontClass}
        onRetry={() => void serviceQuery.refetch()}
      />
    );
  }

  return (
    <ScrollView
      testID="player-service-detail"
      className="flex-1 bg-white"
      contentContainerClassName="grow px-lg py-lg"
      contentContainerStyle={androidInsets}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PageWidth className="gap-lg">
        <PressableScale
          accessibilityLabel={t('playerServices:detailBack')}
          onPress={back}
          haptic="tapLight"
          className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
        >
          <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
            {t('playerServices:detailBack')}
          </Text>
        </PressableScale>
        {isOffline ? (
          <OfflineBanner
            label={t('playerServices:offline')}
            languageFontClass={languageFontClass}
          />
        ) : null}

        {service === undefined || title === undefined ? (
          <View className="flex-1 items-center justify-center gap-md py-3xl">
            <Text
              accessibilityRole="header"
              className={`text-center text-xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('playerServices:detailNotFoundTitle')}
            </Text>
            <Text className={`text-center text-md text-neutral-600 ${languageFontClass}`}>
              {t('playerServices:detailNotFoundBody')}
            </Text>
          </View>
        ) : (
          <ServiceArticle
            service={{
              title: service.title,
              description: service.description,
              images: service.images.map((image) => ({
                id: image.id,
                url: image.url,
                altText: image.alt_text,
              })),
              providerName: service.provider_name,
              location: service.location,
              costType: service.cost_type,
              costAmount: service.cost_amount,
              schedule: service.schedule,
              availability: service.availability,
              metadata: service.metadata,
              contactPhone: service.contact_phone,
              contactEmail: service.contact_email,
              externalUrl: service.external_url,
            }}
            formFields={category?.contract.formFields ?? []}
            onOpenContact={(url) => void openContact(url)}
            contactErrorCode={contactErrorCode}
          >
            <PressableScale
              testID="service-interest-toggle"
              accessibilityLabel={
                service.interested
                  ? t('playerServices:interestRemove')
                  : t('playerServices:interestAdd')
              }
              onPress={toggleInterest}
              haptic="tapLight"
              isBusy={interest.isPending}
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-lg font-bold text-white ${languageFontClass}`}>
                {interest.isPending
                  ? t('playerServices:interestPending')
                  : service.interested
                    ? t('playerServices:interestRemove')
                    : t('playerServices:interestAdd')}
              </Text>
            </PressableScale>
            {interest.isSuccess ? (
              <SuccessPop>
                <Text
                  accessibilityRole="alert"
                  className={`text-center text-md font-semibold text-neutral-900 ${languageFontClass}`}
                >
                  {interest.variables.interested
                    ? t('playerServices:interestAdded')
                    : t('playerServices:interestRemoved')}
                </Text>
              </SuccessPop>
            ) : null}
            {interestErrorCode === null ? null : (
              <FailureNotice code={interestErrorCode} message={t(`errors:${interestErrorCode}`)} />
            )}
          </ServiceArticle>
        )}
      </PageWidth>
    </ScrollView>
  );
}
