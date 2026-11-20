import { GalleryGrid } from '@/components/gallery/gallery-grid';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { PressableScale } from '@/components/motion/pressable-scale';
import { toUnopenedIdSet } from '@/lib/community-news';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTabNews } from '@/lib/use-tab-news';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';
import { EMPTY_TAB_NEWS } from '@ramassa/shared/tab-news';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  content: { padding: tokens.spacing.md, paddingBottom: tokens.spacing['3xl'] },
});

/** Kept for existing links; Comunitat renders the same grid as its Galeria segment. */
export default function GalleryScreen() {
  const { t } = useTranslation('gallery');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const openUpload = useCallback(() => push('/gallery/upload' as Href), [push]);
  // The same grid as Comunitat's Galeria: the grid clears the gallery number
  // once its photos are on show, and the photos she has not opened keep their
  // mark the same way (RAPP-873).
  const gallery = useTabNews().data?.gallery ?? EMPTY_TAB_NEWS.gallery;
  const unopenedItemIds = useMemo(
    () => toUnopenedIdSet(gallery.unopenedItemIds),
    [gallery.unopenedItemIds],
  );
  const header = useMemo(
    () => (
      <PageWidth className="gap-md pb-lg">
        <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
          {t('intro')}
        </Text>
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
    [languageFontClass, openUpload, t],
  );

  return (
    <>
      <NativeScreenHeader title={t('title')} />
      <GalleryGrid
        header={header}
        contentContainerStyle={styles.content}
        unopenedItemIds={unopenedItemIds}
      />
    </>
  );
}
