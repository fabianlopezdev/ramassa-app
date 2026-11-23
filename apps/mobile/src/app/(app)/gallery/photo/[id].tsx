import { GalleryItemActions } from '@/components/gallery/gallery-item-actions';
import { PhotoLightbox, type LightboxPhoto } from '@/components/media/photo-lightbox';
import { formatGalleryDate } from '@/lib/gallery-date';
import { resolveMediaImageSource } from '@/lib/media-source';
import { isGalleryPhoto, useGalleryItem, useGalleryItems } from '@/lib/player-gallery';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMarkGalleryItemSeen } from '@/lib/use-tab-news';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import type { MediaItemRow } from '@ramassa/shared/media';

const NO_GALLERY_ITEMS: readonly MediaItemRow[] = [];
const styles = StyleSheet.create({
  title: { writingDirection: 'auto' },
});

/**
 * A gallery photo at full screen, opened straight from its tile (RAPP-931).
 * She swipes to the photos before and after it, in the gallery's order and
 * leaving the videos out. Over the foot of the photo: its title, the day it
 * was shared, who shared it with the report flag, and for her own photos who
 * can see it and the delete button. A single tap hides that and shows it again.
 */
export default function GalleryPhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t, i18n } = useTranslation(['gallery', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [shownId, setShownId] = useState(id);
  const galleryPhotos = useGalleryItems().data ?? NO_GALLERY_ITEMS;
  // Opened from a link before the gallery has loaded, the photo stands alone.
  const shownItem = useGalleryItem(shownId).data;
  useMarkGalleryItemSeen(shownItem?.id);

  const items = useMemo(() => {
    const photos = galleryPhotos.filter(isGalleryPhoto);
    if (photos.some((photo) => photo.id === shownId)) return photos;
    return shownItem !== undefined && isGalleryPhoto(shownItem) ? [shownItem] : NO_GALLERY_ITEMS;
  }, [galleryPhotos, shownId, shownItem]);
  const photos = useMemo<readonly LightboxPhoto[]>(
    () =>
      items.map((item) => ({
        key: item.id,
        source: resolveMediaImageSource({
          objectKeyOrUrl: item.file_url,
          mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
          accessToken,
        }),
        accessibilityLabel:
          item.caption ?? t('gallery:mediaBy', { name: item.uploader_first_name }),
      })),
    [accessToken, items, t],
  );
  const item = items.find((photo) => photo.id === shownId) ?? shownItem;

  const overlay =
    item === undefined ? undefined : (
      <View key={item.id} className="gap-md">
        <View className="gap-xs">
          {item.caption === null ? null : (
            <Text
              testID="gallery-lightbox-title"
              accessibilityRole="header"
              style={styles.title}
              className={`text-start text-xl font-bold text-white ${languageFontClass}`}
            >
              {item.caption}
            </Text>
          )}
          <Text
            testID="gallery-lightbox-date"
            className={`text-start text-sm text-white ${languageFontClass}`}
          >
            {formatGalleryDate(item.created_at, i18n.resolvedLanguage ?? DEFAULT_LANGUAGE)}
          </Text>
        </View>
        <GalleryItemActions item={item} surface="photo" onDeleted={back} />
      </View>
    );

  return (
    <PhotoLightbox
      photos={photos}
      currentKey={shownId}
      onCurrentKeyChange={setShownId}
      closeLabel={t('common:close')}
      onClose={back}
      overlay={overlay}
    />
  );
}
