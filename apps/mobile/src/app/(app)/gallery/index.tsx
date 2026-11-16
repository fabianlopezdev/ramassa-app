import { OfflineBanner } from '@/components/announcements/feed-states';
import { GalleryGrid } from '@/components/gallery/gallery-grid';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  content: { padding: tokens.spacing.md, paddingBottom: tokens.spacing['3xl'] },
});

/** Kept for existing links; Comunitat renders the same grid as its Galeria segment. */
export default function GalleryScreen() {
  const { t } = useTranslation('gallery');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const openUpload = useCallback(() => push('/gallery/upload' as Href), [push]);
  const header = useMemo(
    () => (
      <PageWidth className="gap-md pb-lg">
        <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
          {t('intro')}
        </Text>
        {!isOnline ? (
          <OfflineBanner label={t('offline')} languageFontClass={languageFontClass} />
        ) : null}
        <PressableScale
          testID="gallery-upload"
          accessibilityLabel={t('upload')}
          onPress={openUpload}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`font-bold text-white ${languageFontClass}`}>{t('upload')}</Text>
        </PressableScale>
      </PageWidth>
    ),
    [isOnline, languageFontClass, openUpload, t],
  );

  return (
    <>
      <NativeScreenHeader title={t('title')} />
      <GalleryGrid header={header} contentContainerStyle={styles.content} />
    </>
  );
}
