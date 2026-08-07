import { announcementCategoryLabel } from '@/components/announcements/category-filters';
import { OfflineBanner } from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { PressableScale } from '@/components/motion/pressable-scale';
import { usePlayerAnnouncements } from '@/lib/announcement-feed';
import { continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { isNetworkStateOnline } from '@/lib/network-status';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  imageFrame: {
    width: '100%',
    height: tokens.contentWidth.form / 2,
  },
  image: { width: '100%', height: '100%' },
});
const imageFrameStyle = StyleSheet.compose(continuousCorners, styles.imageFrame);

export default function AnnouncementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { session } = useAuth();
  const { t, i18n } = useTranslation(['home', 'common']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const { data } = usePlayerAnnouncements();
  const announcement = data?.find((row) => row.id === id);
  const title =
    announcement === undefined ? undefined : resolveLocalizedText(announcement.title, language);
  const body =
    announcement === undefined ? undefined : resolveLocalizedText(announcement.body, language);
  const imageAlt =
    announcement?.image_alt === null || announcement?.image_alt === undefined
      ? undefined
      : resolveLocalizedText(announcement.image_alt, language);
  const imageSource = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: announcement?.image_url ?? null,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken: session?.access_token,
      }),
    [announcement?.image_url, session?.access_token],
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', { dateStyle: 'long' }),
    [i18n.resolvedLanguage],
  );
  const insets = useSafeAreaInsets();
  const androidEdgeInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: insets.top + tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing.lg,
          }
        : undefined,
    [insets.bottom, insets.top],
  );
  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="grow px-lg py-lg"
      contentContainerStyle={androidEdgeInsets}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PageWidth className="gap-lg">
        <PressableScale
          accessibilityLabel={t('common:back')}
          onPress={back}
          haptic="tapLight"
          className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
        >
          <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
            {t('common:back')}
          </Text>
        </PressableScale>

        {isOffline ? (
          <OfflineBanner label={t('offlineBanner')} languageFontClass={languageFontClass} />
        ) : null}

        {announcement === undefined || title === undefined || body === undefined ? (
          <View className="flex-1 items-center justify-center gap-md py-3xl">
            <Text
              accessibilityRole="header"
              className={`text-center text-xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('emptyTitle')}
            </Text>
            <Text className={`text-center text-md text-neutral-600 ${languageFontClass}`}>
              {t('emptyBody')}
            </Text>
          </View>
        ) : (
          <FadeSlideIn index={0}>
            <View className="gap-md">
              <View className="flex-row flex-wrap items-center gap-sm">
                <View className="rounded-full bg-neutral-100 px-sm py-xs">
                  <Text className={`text-sm font-medium text-neutral-700 ${languageFontClass}`}>
                    {announcementCategoryLabel(announcement.category, t)}
                  </Text>
                </View>
                {announcement.is_pinned ? (
                  <View className="rounded-full bg-secondary px-sm py-xs">
                    <Text className={`text-sm font-semibold text-neutral-900 ${languageFontClass}`}>
                      {t('pinned')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                accessibilityRole="header"
                className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {title.text}
              </Text>
              <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
                {dateFormatter.format(
                  new Date(announcement.published_at ?? announcement.created_at),
                )}
              </Text>
              {imageSource === null ? null : (
                <View className="overflow-hidden rounded-lg" style={imageFrameStyle}>
                  <Image
                    source={imageSource}
                    accessible={imageAlt !== undefined}
                    accessibilityLabel={imageAlt?.text}
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    style={styles.image}
                  />
                </View>
              )}
              <Text className={`text-start text-lg text-neutral-800 ${languageFontClass}`}>
                {body.text}
              </Text>
            </View>
          </FadeSlideIn>
        )}
      </PageWidth>
    </ScrollView>
  );
}
