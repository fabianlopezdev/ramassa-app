/**
 * The title of an opened gallery photo or video, drawn on the media (RAPP-897).
 *
 * It sits at the bottom-start of the picture in white, on a dark fade that
 * covers only the band behind the text, so it reads on any picture. A long
 * title shows three lines; `onCutChange` tells the screen when it was cut, so
 * the screen can print the whole text under the media. A control at the end,
 * such as the report flag on a photo, takes its own touches; every other touch
 * passes through to the media under it.
 */
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { GALLERY_MEDIA_TITLE_MAX_LINES } from '@/lib/gallery-media-frame';
import { memo, useCallback, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextLayoutEventData,
  type ViewStyle,
} from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// The dark fade behind the title, as two hex digits of opacity after the token
// colour: 70% at the bottom edge, still 50% where a third line of text begins,
// then clear at the top, so the fade has no visible start on the picture.
const SCRIM_BOTTOM = `${tokens.colors.black}B3`;
const SCRIM_BEHIND_TOP_LINE = `${tokens.colors.black}80 55%`;
const SCRIM_CLEAR = `${tokens.colors.black}00`;
const styles = StyleSheet.create({
  scrim: {
    backgroundImage: `linear-gradient(to top, ${SCRIM_BOTTOM}, ${SCRIM_BEHIND_TOP_LINE}, ${SCRIM_CLEAR})`,
  },
  title: { writingDirection: 'auto' },
});
const TITLE_TEXT_CLASS = 'text-start text-lg font-semibold text-white';

export const GalleryMediaTitle = memo(function GalleryMediaTitle({
  title,
  fontClass,
  onCutChange,
  endAction = null,
  style,
}: {
  /** Null for an item without a title: only the control at the end is drawn. */
  readonly title: string | null;
  readonly fontClass: string;
  /** Called with whether the whole title needs more than the lines shown. */
  readonly onCutChange: (isCut: boolean) => void;
  /** A control at the bottom-end corner, such as the report flag on a photo. */
  readonly endAction?: ReactNode;
  /** Where the picture's own bottom edge is inside its frame. */
  readonly style?: StyleProp<ViewStyle>;
}) {
  const reportCut = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<TextLayoutEventData>) =>
      onCutChange(nativeEvent.lines.length > GALLERY_MEDIA_TITLE_MAX_LINES),
    [onCutChange],
  );
  return (
    <View pointerEvents="box-none" style={style}>
      {title === null ? null : (
        <View pointerEvents="none" className="absolute inset-0">
          <FadeSlideIn preset="fade" className="flex-1">
            <View style={styles.scrim} className="flex-1" />
          </FadeSlideIn>
        </View>
      )}
      <View pointerEvents="box-none" className="flex-row items-end gap-sm p-sm pt-2xl">
        <View pointerEvents="none" className="flex-1 pb-xs ps-sm">
          {title === null ? null : (
            <View>
              {/* The same text with no line limit, never seen: it counts the
                  lines the whole title needs at this width and text size. */}
              <Text
                aria-hidden
                pointerEvents="none"
                style={styles.title}
                className={`absolute end-0 start-0 top-0 opacity-0 ${TITLE_TEXT_CLASS} ${fontClass}`}
                onTextLayout={reportCut}
              >
                {title}
              </Text>
              <FadeSlideIn preset="fade">
                <Text
                  testID="gallery-media-title"
                  numberOfLines={GALLERY_MEDIA_TITLE_MAX_LINES}
                  style={styles.title}
                  className={`${TITLE_TEXT_CLASS} ${fontClass}`}
                >
                  {title}
                </Text>
              </FadeSlideIn>
            </View>
          )}
        </View>
        {endAction}
      </View>
    </View>
  );
});
