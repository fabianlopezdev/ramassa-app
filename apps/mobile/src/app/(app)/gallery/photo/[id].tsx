import { PhotoLightbox } from '@/components/media/photo-lightbox';
import { resolveMediaImageSource } from '@/lib/media-source';
import { useGalleryItem } from '@/lib/player-gallery';
import { mobileClientEnv } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';

/** An opened gallery photo at full screen, from a tap on it (RAPP-913). */
export default function GalleryPhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t } = useTranslation(['gallery', 'common']);
  const { session } = useAuth();
  // The item screen under it has loaded the item, so this reads it from the cache.
  const item = useGalleryItem(id).data;
  const accessToken = session?.access_token;
  const source = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: item?.file_url ?? null,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, item?.file_url],
  );
  return (
    <PhotoLightbox
      source={source}
      accessibilityLabel={
        item?.caption ?? t('gallery:mediaBy', { name: item?.uploader_first_name ?? '' })
      }
      closeLabel={t('common:close')}
      onClose={back}
    />
  );
}
