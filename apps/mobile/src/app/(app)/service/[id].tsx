import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { FailureNotice } from '@/components/error-code-line';
import { EventDetailLine } from '@/components/events/event-card';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SuccessPop } from '@/components/motion/success-pop';
import { continuousCorners } from '@/lib/continuous-corners';
import { playErrorHaptic } from '@/lib/haptics/haptics';
import { resolveMediaImageSource } from '@/lib/media-source';
import { isNetworkStateOnline } from '@/lib/network-status';
import { safeAsync } from '@/lib/observability';
import {
  usePlayerServiceCategories,
  usePlayerServiceDetail,
  useServiceInterest,
} from '@/lib/player-services';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import {
  buildServiceContactLinks,
  type PlayerServiceImageRow,
  type PlayerServiceRow,
  type ServiceMetadataFieldDefinition,
} from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  images: { height: tokens.spacing['3xl'] * 3 },
  image: {
    width: tokens.contentWidth.form - tokens.spacing['3xl'] * 2,
    height: tokens.spacing['3xl'] * 3,
    borderRadius: tokens.radius.lg,
  },
});
const imageKeyExtractor = (image: PlayerServiceImageRow) => image.id;
const ImageSeparator = () => <View className="w-sm" />;

function ServiceImage({
  image,
  alt,
}: {
  readonly image: PlayerServiceImageRow;
  readonly alt: string;
}) {
  const { session } = useAuth();
  const source = resolveMediaImageSource({
    objectKeyOrUrl: image.url,
    mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
    accessToken: session?.access_token,
  });
  if (source === null) return null;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={alt} style={styles.image}>
      <Image
        source={source}
        accessible={false}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={image.url}
        style={styles.image}
      />
    </View>
  );
}

function ContactAction({
  label,
  url,
  onOpen,
}: {
  readonly label: string;
  readonly url: string;
  readonly onOpen: (url: string) => void;
}) {
  const languageFontClass = useLanguageFontClass();
  const handlePress = useCallback(() => onOpen(url), [onOpen, url]);
  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={handlePress}
      haptic="tapLight"
      className="min-h-recommended basis-[48%] grow items-center justify-center rounded-md border border-primary px-md"
      style={continuousCorners}
    >
      <Text className={`text-center text-md font-bold text-primary-dark ${languageFontClass}`}>
        {label}
      </Text>
    </PressableScale>
  );
}

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t, i18n } = useTranslation(['playerServices', 'errors']);
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
  const description =
    service?.description === null || service?.description === undefined
      ? undefined
      : resolveLocalizedText(service.description, language);
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage ?? 'ca', {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.resolvedLanguage],
  );
  const cost =
    service === undefined
      ? null
      : service.cost_amount === null
        ? t(`playerServices:cost${capitalize(service.cost_type)}`)
        : currencyFormatter.format(service.cost_amount);
  const contactLinks = useMemo(
    () =>
      buildServiceContactLinks(
        {
          phone: service?.contact_phone ?? null,
          email: service?.contact_email ?? null,
          location: service?.location ?? null,
          externalUrl: service?.external_url ?? null,
        },
        Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web',
      ),
    [service?.contact_email, service?.contact_phone, service?.external_url, service?.location],
  );
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
  const renderImage = useCallback(
    ({ item }: ListRenderItemInfo<PlayerServiceImageRow>) => {
      const alt = resolveLocalizedText(item.alt_text, language);
      return alt === undefined ? null : <ServiceImage image={item} alt={alt.text} />;
    },
    [language],
  );

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
          <View className="gap-xl">
            <View className="gap-md">
              <Text
                accessibilityRole="header"
                className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {title.text}
              </Text>
              {description === undefined ? null : (
                <Text className={`text-start text-lg text-neutral-700 ${languageFontClass}`}>
                  {description.text}
                </Text>
              )}
            </View>

            {service.images.length === 0 ? null : (
              <FlashList
                horizontal
                accessibilityRole="list"
                data={service.images}
                renderItem={renderImage}
                keyExtractor={imageKeyExtractor}
                ItemSeparatorComponent={ImageSeparator}
                style={styles.images}
              />
            )}

            <View className="gap-md rounded-lg bg-neutral-50 p-lg" style={continuousCorners}>
              <Text
                accessibilityRole="header"
                className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('playerServices:details')}
              </Text>
              {service.provider_name === null ? null : (
                <EventDetailLine
                  label={t('playerServices:provider')}
                  value={service.provider_name}
                  languageFontClass={languageFontClass}
                />
              )}
              {service.location === null ? null : (
                <EventDetailLine
                  label={t('playerServices:location')}
                  value={service.location}
                  languageFontClass={languageFontClass}
                />
              )}
              {cost === null ? null : (
                <EventDetailLine
                  label={t('playerServices:cost')}
                  value={cost}
                  languageFontClass={languageFontClass}
                />
              )}
              {service.schedule === null ? null : (
                <EventDetailLine
                  label={t('playerServices:schedule')}
                  value={service.schedule}
                  languageFontClass={languageFontClass}
                />
              )}
              <EventDetailLine
                label={t('playerServices:availability')}
                value={t(`playerServices:availability${availabilityKey(service.availability)}`)}
                languageFontClass={languageFontClass}
              />
              {category?.contract.formFields.map((field) => {
                const value = service.metadata[field.key];
                const label = resolveLocalizedText(field.label, language);
                if (value === undefined || value === null || label === undefined) return null;
                return (
                  <EventDetailLine
                    key={field.key}
                    label={label.text}
                    value={metadataValueLabel(field, value, t)}
                    languageFontClass={languageFontClass}
                  />
                );
              })}
            </View>

            {Object.values(contactLinks).every((value) => value === null) ? null : (
              <View className="gap-md">
                <Text
                  accessibilityRole="header"
                  className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
                >
                  {t('playerServices:contact')}
                </Text>
                <View className="flex-row flex-wrap gap-sm">
                  {contactLinks.phone === null ? null : (
                    <ContactAction
                      label={t('playerServices:call')}
                      url={contactLinks.phone}
                      onOpen={openContact}
                    />
                  )}
                  {contactLinks.email === null ? null : (
                    <ContactAction
                      label={t('playerServices:email')}
                      url={contactLinks.email}
                      onOpen={openContact}
                    />
                  )}
                  {contactLinks.map === null ? null : (
                    <ContactAction
                      label={t('playerServices:map')}
                      url={contactLinks.map}
                      onOpen={openContact}
                    />
                  )}
                  {contactLinks.external === null ? null : (
                    <ContactAction
                      label={t('playerServices:website')}
                      url={contactLinks.external}
                      onOpen={openContact}
                    />
                  )}
                </View>
                {contactErrorCode === null ? null : (
                  <FailureNotice
                    code={contactErrorCode}
                    message={t(`errors:${contactErrorCode}`)}
                  />
                )}
              </View>
            )}

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
          </View>
        )}
      </PageWidth>
    </ScrollView>
  );
}

function metadataValueLabel(
  field: ServiceMetadataFieldDefinition,
  value: unknown,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (typeof value === 'boolean') return value ? t('filterYes') : t('filterNo');
  if (Array.isArray(value)) {
    return value.map((item) => optionLabel(item, t)).join(', ');
  }
  if (field.options !== undefined) return optionLabel(value, t);
  return String(value);
}

function optionLabel(value: unknown, t: ReturnType<typeof useTranslation>['t']): string {
  const raw = String(value);
  return t(`option.${raw}`, { defaultValue: raw.replaceAll('_', ' ') });
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function availabilityKey(value: PlayerServiceRow['availability']): string {
  if (value === 'waiting_list') return 'WaitingList';
  if (value === 'by_appointment') return 'ByAppointment';
  return capitalize(value);
}
