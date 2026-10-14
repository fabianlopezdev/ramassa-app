/**
 * One service as a player sees it: title, description, photos, the details
 * with the category's own fields, and the contact actions, in the reader's
 * language. The player screen passes its interest action in as `children`.
 * The team's editor draws its unsaved draft with it (RAPP-373), so the preview
 * is the player's own layout.
 */
import { FailureNotice } from '@/components/error-code-line';
import { EventDetailLine } from '@/components/events/event-card';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage, type LocalizedContent } from '@ramassa/shared/i18n';
import {
  buildServiceContactLinks,
  type PlayerServiceRow,
  type ServiceMetadataFieldDefinition,
} from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  images: { height: tokens.spacing['3xl'] * 3 },
  imageFrame: {
    width: tokens.contentWidth.form - tokens.spacing['3xl'] * 2,
    height: tokens.spacing['3xl'] * 3,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  image: {
    width: tokens.contentWidth.form - tokens.spacing['3xl'] * 2,
    height: tokens.spacing['3xl'] * 3,
  },
});
const imageFrameStyle: StyleProp<ViewStyle> = [styles.imageFrame, continuousCorners];

export interface ServiceArticleImage {
  readonly id: string;
  /** A stored object key, or a photo on the device in a draft. */
  readonly url: string;
  readonly altText: LocalizedContent;
}

export interface ServiceArticleContent {
  readonly title: LocalizedContent;
  readonly description: LocalizedContent | null;
  readonly images: readonly ServiceArticleImage[];
  readonly providerName: string | null;
  readonly location: string | null;
  readonly costType: PlayerServiceRow['cost_type'];
  readonly costAmount: number | null;
  readonly schedule: string | null;
  readonly availability: PlayerServiceRow['availability'];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly contactPhone: string | null;
  readonly contactEmail: string | null;
  readonly externalUrl: string | null;
}

const imageKeyExtractor = (image: ServiceArticleImage) => image.id;
const ImageSeparator = () => <View className="w-sm" />;

function ServiceImage({
  image,
  alt,
}: {
  readonly image: ServiceArticleImage;
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
    <View accessible accessibilityRole="image" accessibilityLabel={alt} style={imageFrameStyle}>
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

export function ServiceArticle({
  service,
  formFields,
  onOpenContact,
  contactErrorCode,
  children,
}: {
  readonly service: ServiceArticleContent;
  /** The category's own fields, in the order players see them. */
  readonly formFields: readonly ServiceMetadataFieldDefinition[];
  readonly onOpenContact: (url: string) => void;
  readonly contactErrorCode: AppErrorCode | null;
  /** The interest action under the contact actions. */
  readonly children: ReactNode;
}) {
  const { t, i18n } = useTranslation(['playerServices', 'errors']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const title = resolveLocalizedText(service.title, language)?.text ?? '';
  const description =
    service.description === null ? undefined : resolveLocalizedText(service.description, language);
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage ?? 'ca', { style: 'currency', currency: 'EUR' }),
    [i18n.resolvedLanguage],
  );
  const cost =
    service.costAmount === null
      ? t(`playerServices:cost${capitalize(service.costType)}`)
      : currencyFormatter.format(service.costAmount);
  const contactLinks = useMemo(
    () =>
      buildServiceContactLinks(
        {
          phone: service.contactPhone,
          email: service.contactEmail,
          location: service.location,
          externalUrl: service.externalUrl,
        },
        process.env.EXPO_OS === 'android' || process.env.EXPO_OS === 'ios'
          ? process.env.EXPO_OS
          : 'web',
      ),
    [service.contactEmail, service.contactPhone, service.externalUrl, service.location],
  );
  const renderImage = useCallback(
    ({ item }: ListRenderItemInfo<ServiceArticleImage>) => {
      const alt = resolveLocalizedText(item.altText, language);
      return alt === undefined ? null : <ServiceImage image={item} alt={alt.text} />;
    },
    [language],
  );

  return (
    <View className="gap-xl">
      <View className="gap-md">
        <Text
          accessibilityRole="header"
          className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
        >
          {title}
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
          accessibilityLabel={t('playerServices:images')}
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
        {service.providerName === null ? null : (
          <EventDetailLine
            label={t('playerServices:provider')}
            value={service.providerName}
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
        <EventDetailLine
          label={t('playerServices:cost')}
          value={cost}
          languageFontClass={languageFontClass}
        />
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
        {formFields.map((field) => {
          const value = service.metadata[field.key];
          const label = resolveLocalizedText(field.label, language);
          // A draft holds an unanswered field as blank; a stored service leaves it out.
          const isBlank =
            value === undefined ||
            value === null ||
            value === '' ||
            (Array.isArray(value) && value.length === 0);
          if (isBlank || label === undefined) return null;
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
                onOpen={onOpenContact}
              />
            )}
            {contactLinks.email === null ? null : (
              <ContactAction
                label={t('playerServices:email')}
                url={contactLinks.email}
                onOpen={onOpenContact}
              />
            )}
            {contactLinks.map === null ? null : (
              <ContactAction
                label={t('playerServices:map')}
                url={contactLinks.map}
                onOpen={onOpenContact}
              />
            )}
            {contactLinks.external === null ? null : (
              <ContactAction
                label={t('playerServices:website')}
                url={contactLinks.external}
                onOpen={onOpenContact}
              />
            )}
          </View>
          {contactErrorCode === null ? null : (
            <FailureNotice code={contactErrorCode} message={t(`errors:${contactErrorCode}`)} />
          )}
        </View>
      )}

      {children}
    </View>
  );
}

/**
 * The interest action of a draft's preview (RAPP-373): the label a player will
 * see, which does nothing here.
 */
export function ServiceInterestPreview() {
  const { t } = useTranslation('playerServices');
  const languageFontClass = useLanguageFontClass();
  return (
    <View
      style={continuousCorners}
      className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
    >
      <Text className={`text-center text-lg font-bold text-white ${languageFontClass}`}>
        {t('interestAdd')}
      </Text>
    </View>
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
