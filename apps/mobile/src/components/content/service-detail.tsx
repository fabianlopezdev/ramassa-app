/**
 * One service for the team (RAPP-344): its status and category, the Catalan
 * title and description, the provider, place, cost, contact, schedule, link
 * and availability, the category's extra fields, the photos, and how many
 * players are interested. Edit opens the editor; deleting is for
 * `services.publish` holders, as the database requires, and asks first. A
 * screen of its own on a phone; the right half of the list on a tablet.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { PreviewItemAsPlayer } from '@/components/preview/preview-as-player';
import {
  useContentService,
  useContentServiceCategories,
  useServiceActions,
} from '@/lib/content-services';
import { composeContinuousViewStyle, continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@ramassa/shared/i18n';
import {
  getServiceLifecycle,
  type AdminServiceCategory,
  type AdminServiceDetail,
} from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';
import {
  fieldLabel,
  formatMetadataValue,
  SERVICE_AVAILABILITY_KEYS,
  SERVICE_COST_KEYS,
  SERVICE_STATUS_KEYS,
} from './service-labels';

const styles = StyleSheet.create({
  imageFrame: { width: '100%', height: tokens.contentWidth.form / 2 },
  image: { width: '100%', height: '100%' },
});
const imageFrameStyle = composeContinuousViewStyle(styles.imageFrame);

function Row({ label, value }: { readonly label: string; readonly value: string | null }) {
  const fontClass = useLanguageFontClass();
  if (value === null || value.length === 0) return null;
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className="gap-xs py-xs">
      <Text className={`text-start text-sm text-neutral-500 ${fontClass}`}>{label}</Text>
      <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
        {value}
      </Text>
    </View>
  );
}

/**
 * A service's facts as staff read them (RAPP-344): description, the common
 * fields, the category's extra fields and the photos. Also the body of a
 * review (RAPP-345).
 */
export function ServiceFacts({
  service,
  images,
  category,
}: {
  readonly service: AdminServiceDetail['service'];
  readonly images: AdminServiceDetail['images'];
  readonly category: AdminServiceCategory | undefined;
}) {
  const { t, i18n } = useTranslation('services');
  const { t: tAnnouncements } = useTranslation('announcements');
  const fontClass = useLanguageFontClass();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const { session } = useAuth();
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [language],
  );
  const cost = [
    t(SERVICE_COST_KEYS[service.cost_type]),
    service.cost_amount === null ? null : String(service.cost_amount),
    service.cost_details,
  ]
    .filter(Boolean)
    .join(' · ');
  const date = (value: string | null) => (value === null ? null : format.format(new Date(value)));
  return (
    <>
      {service.description === null ? null : (
        <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
          {service.description.ca}
        </Text>
      )}
      <View
        style={continuousCorners}
        className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
      >
        <Row label={t('fieldProviderName')} value={service.provider_name} />
        <Row
          label={t('fieldLocation')}
          value={[service.location, service.zone].filter(Boolean).join(' · ')}
        />
        <Row label={t('fieldCostType')} value={cost} />
        <Row
          label={t('fieldContactName')}
          value={[service.contact_name, service.contact_role].filter(Boolean).join(' · ')}
        />
        <Row label={t('fieldContactPhone')} value={service.contact_phone} />
        <Row label={t('fieldContactEmail')} value={service.contact_email} />
        <Row label={t('fieldSchedule')} value={service.schedule} />
        <Row label={t('fieldExternalUrl')} value={service.external_url} />
        <Row
          label={t('fieldAvailability')}
          value={t(SERVICE_AVAILABILITY_KEYS[service.availability])}
        />
        <Row label={t('columnInterests')} value={String(service.interest_count)} />
        <Row label={tAnnouncements('columnPublication')} value={date(service.published_at)} />
        <Row label={tAnnouncements('columnExpiry')} value={date(service.expires_at)} />
      </View>
      {category === undefined || category.definition.fields.length === 0 ? null : (
        <View
          testID="service-detail-metadata"
          style={continuousCorners}
          className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
        >
          {category.definition.fields.map((field) => (
            <Row
              key={field.key}
              label={fieldLabel(field, language)}
              value={formatMetadataValue(field, service.metadata[field.key], t)}
            />
          ))}
        </View>
      )}
      {images.map((image, index) => {
        const source = resolveMediaImageSource({
          objectKeyOrUrl: image.url,
          mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
          accessToken: session?.access_token,
        });
        return source === null ? null : (
          <View
            key={image.id}
            testID={`service-detail-image-${index}`}
            className="overflow-hidden rounded-md"
            style={imageFrameStyle}
          >
            <Image
              source={source}
              accessibilityLabel={image.alt_text.ca}
              cachePolicy="memory-disk"
              contentFit="cover"
              style={styles.image}
            />
          </View>
        );
      })}
    </>
  );
}

export function ServiceDetail({
  serviceId,
  onBack,
  onDeleted,
}: {
  readonly serviceId: string;
  readonly onBack?: () => void;
  readonly onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation('services');
  const { t: tCommon } = useTranslation('common');
  const { t: tProfile } = useTranslation('profile');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const canPublish = useAccountAccess().permissions.has('services.publish');
  const { push } = useRouter();
  const detail = useContentService(serviceId);
  const categories = useContentServiceCategories();
  const { remove } = useServiceActions();
  if (detail.isPending) return <AnnouncementFeedSkeleton accessibilityLabel={t('title')} />;
  if (detail.isError) {
    return (
      <AnnouncementFeedError
        message={t('loadFailed')}
        retryLabel={tErrors('retry')}
        code={toAppError(detail.error).code}
        languageFontClass={fontClass}
        onRetry={() => void detail.refetch()}
        isLoading={detail.isFetching}
      />
    );
  }
  if (detail.data === undefined) {
    return <AnnouncementEmptyState title={t('loadFailed')} body="" languageFontClass={fontClass} />;
  }
  const { service, images } = detail.data;
  const category = categories.data?.find((candidate) => candidate.id === service.category_id);
  const lifecycle = getServiceLifecycle({
    status: service.status,
    publishedAt: service.published_at,
    expiresAt: service.expires_at,
  });
  const confirmDelete = () => {
    const done = () =>
      remove.mutate(service.id, {
        onSuccess: () => {
          playHaptic('success');
          onDeleted();
        },
      });
    // The web build has no native alert, so it asks through the browser.
    if (Platform.OS === 'web') {
      if (window.confirm(t('deleteConfirm'))) done();
      return;
    }
    Alert.alert(t('deleteConfirm'), service.title.ca, [
      { text: tProfile('cancelAction'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: done },
    ]);
  };

  return (
    <ScrollView contentContainerClassName="gap-md p-lg" testID="service-detail">
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
        <Text
          accessibilityRole="header"
          className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
        >
          {service.title.ca}
        </Text>
        <Text
          testID="service-detail-status"
          className={`text-start text-sm font-semibold text-neutral-700 ${fontClass}`}
        >
          {[
            t(SERVICE_STATUS_KEYS[lifecycle]),
            category === undefined ? null : (category.name[language] ?? category.name.ca),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <PressableScale
          testID="service-edit"
          accessibilityRole="button"
          accessibilityLabel={t('editTitle')}
          onPress={() => push(`/content-service-edit/${service.id}` as Href)}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
            {t('edit')}
          </Text>
        </PressableScale>
        {canPublish ? (
          <PressableScale
            testID="service-delete"
            accessibilityRole="button"
            accessibilityLabel={t('delete')}
            onPress={confirmDelete}
            isBusy={remove.isPending}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-error bg-white px-lg"
          >
            <Text className={`text-center text-md font-bold text-error ${fontClass}`}>
              {t('delete')}
            </Text>
          </PressableScale>
        ) : null}
      </View>
      <PreviewItemAsPlayer
        target={`/service/${service.id}`}
        isVisibleToPlayers={lifecycle === 'published'}
      />
      {remove.isError ? (
        <FailureNotice
          code={toAppError(remove.error).code}
          message={tErrors(getErrorMessageKey(toAppError(remove.error).code))}
        />
      ) : null}
      <ServiceFacts service={service} images={images} category={category} />
    </ScrollView>
  );
}
