import { useBrandColor } from '@/components/branding/organization-branding-context';
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { Badge } from '@/components/layout/badge';
import { PhotoFade } from '@/components/media/photo-fade';
import { continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { motionTokens } from '@ramassa/shared/tokens/motion';

const GALLERY_TILE_ASPECT_RATIO = 1;
const styles = StyleSheet.create({
  tile: { width: '100%', aspectRatio: GALLERY_TILE_ASPECT_RATIO },
  title: { writingDirection: 'auto' },
});
const TILE_TITLE_MAX_LINES = 2;
const TILE_TITLE_CLASS = 'text-start text-md font-semibold text-white';
const TILE_DATE_CLASS = 'text-start text-sm text-white';

/**
 * The title and the date on the foot of a gallery photo (RAPP-931), in white
 * on the fade of the card photos. A title takes at most two lines; without
 * one, only the date shows. Every tile is square, so a row stays even.
 */
function GalleryTileCaption({
  title,
  date,
  fontClass,
}: {
  readonly title: string | null;
  readonly date: string;
  readonly fontClass: string;
}) {
  const brandColor = useBrandColor();
  return (
    <PhotoFade
      testID="gallery-tile-caption"
      color={brandColor}
      className="absolute bottom-0 end-0 start-0 gap-xs px-sm pb-sm pt-xl"
    >
      {title === null ? null : (
        <Text
          testID="gallery-tile-title"
          numberOfLines={TILE_TITLE_MAX_LINES}
          style={styles.title}
          className={`${TILE_TITLE_CLASS} ${fontClass}`}
        >
          {title}
        </Text>
      )}
      <Text
        testID="gallery-tile-date"
        numberOfLines={1}
        className={`${TILE_DATE_CLASS} ${fontClass}`}
      >
        {date}
      </Text>
    </PhotoFade>
  );
}

/**
 * The word on a photo new to her (RAPP-873), at its top start corner, where
 * the team's gallery places its mark over a photo, in the colour every "Nou"
 * has. It is not read out and takes no touch: the tile's own label carries
 * the word. Its own component, so a tile without the word looks up no font.
 */
function GalleryTileUnseenMark({ label }: { readonly label: string }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="absolute start-xs top-xs"
    >
      <Badge label={label} tone="brand" languageFontClass={languageFontClass} />
    </View>
  );
}

export const GalleryTile = memo(function GalleryTile({
  id,
  objectKeyOrUrl,
  accessToken,
  accessibilityLabel,
  imageAlt,
  title,
  date,
  fontClass,
  href,
  unseenLabel = null,
}: {
  readonly id: string;
  readonly objectKeyOrUrl: string;
  readonly accessToken: string | undefined;
  /** Says the title and the date too: the text on the photo is not read on its own. */
  readonly accessibilityLabel: string;
  readonly imageAlt: string;
  /** The item's title; null when it has none. */
  readonly title: string | null;
  /** When it was shared, already written in her language. */
  readonly date: string;
  readonly fontClass: string;
  /** A photo opens straight in the lightbox (RAPP-931); a video opens its own screen. */
  readonly href: Href;
  /** Set while the photo is new to her: the word over its top start corner. */
  readonly unseenLabel?: string | null;
}) {
  const { push } = useRouter();
  const open = useCallback(() => push(href), [href, push]);
  const source = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, objectKeyOrUrl],
  );

  return (
    <View className="p-xs">
      <SelectionChoiceSurface
        testID={`gallery-item-${id}`}
        label={accessibilityLabel}
        accessibilityRole="link"
        onPress={open}
        paddingClassName=""
        contentClassName=""
        rowStyle={continuousCorners}
      >
        {/* Grey while the photo loads, or when it has no source. */}
        <View className="bg-neutral-200" style={styles.tile}>
          {source === null ? null : (
            <Image
              recyclingKey={id}
              source={source}
              accessibilityLabel={imageAlt}
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={motionTokens.duration.fast}
              style={StyleSheet.absoluteFill}
            />
          )}
          <GalleryTileCaption title={title} date={date} fontClass={fontClass} />
          {unseenLabel === null ? null : <GalleryTileUnseenMark label={unseenLabel} />}
        </View>
      </SelectionChoiceSurface>
    </View>
  );
});
