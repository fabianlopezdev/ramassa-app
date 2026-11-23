/**
 * A card's photo grows into the photo of the screen it opens (RAPP-916), the
 * way a pack opens in Ottermates: the photo moves from the card to the top of
 * the next screen, and back on return. On iOS the native zoom transition
 * carries it. On Android a Reanimated shared element transition moves the
 * photo itself (RAPP-920). The web opens the screen with its normal push.
 *
 * Four pieces, one per end of the move and one per screen:
 * - `PhotoZoomLink` opens the card's screen. On iOS it is expo-router's `Link`,
 *   the only public way to mint a zoom transition: each `Link` makes its own
 *   identifier, adds it to the navigation when it carries a zoom source, and
 *   requires `asChild`. On Android it is the push the cards always made, with
 *   a mark that tells the opened screen its photo arrives by the move.
 * - `PhotoZoomSource` goes around the card's photo. Inside a `PhotoZoomLink`
 *   of a card with a photo it makes that photo the start of the move.
 * - `PhotoZoomTarget` goes around the photo at the top of the opened screen
 *   (`PhotoHero`). Without a move it draws its photo untouched.
 * - `PhotoZoomBoundary` goes around a whole screen. On Android it tells
 *   Reanimated which screen is in front, so the move runs from the screen she
 *   leaves to the screen she opens. The signed-in stack and each tab put it
 *   around their screens (`screen-entrance`), so no screen asks for it.
 *
 * The source and the target each take one expo-image `Image` as their child.
 * On Android both ends draw that image as the same animated image, tagged by
 * the photo's stored key, which the card and the screen it opens share.
 *
 * With reduce motion on, the card opens with the plain push.
 */
import { useEntrance } from '@/components/motion/fade-slide-in';
import { arrivesByPhotoZoom, withPhotoZoomArrival } from '@/lib/photo-zoom-arrival';
import { Image, type ImageProps } from 'expo-image';
import { Link, useIsFocused, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { BackHandler } from 'react-native';
import Animated, {
  makeMutable,
  ReduceMotion,
  runOnJS,
  SharedTransition,
  SharedTransitionBoundary,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';
import { motionTokens } from '@ramassa/shared/tokens/motion';

const ZOOMS_ON_THIS_PLATFORM = process.env.EXPO_OS === 'ios';
const MOVES_PHOTO_ON_THIS_PLATFORM = process.env.EXPO_OS === 'android';

/** Whether the photo inside the link in hand grows into the next screen. */
const PhotoZoomContext = createContext(false);

const ignorePress = () => undefined;

/**
 * The child of the iOS `Link`. With `asChild` the link hands the press that
 * opens the screen to its one child, so that child must be an element of its
 * own that takes `onPress`: this one passes it on to the card's surface. It
 * keeps the link's other props (`href`, `role`) away from the surface.
 */
function LinkPress({
  render,
  onPress,
}: {
  readonly render: (open: () => void) => ReactNode;
  /** Handed in by the `Link`, never written in JSX. */
  readonly onPress?: () => void;
}) {
  return render(onPress ?? ignorePress);
}

export function PhotoZoomLink({
  href,
  hasPhoto,
  children,
}: {
  /** The screen the card opens. */
  readonly href: Href;
  /** The card shows a photo, and the screen it opens starts with that photo. */
  readonly hasPhoto: boolean;
  /** Draws the card's surface with the press that opens the screen. */
  readonly children: (open: () => void) => ReactNode;
}) {
  const { push } = useRouter();
  const isReducedMotion = useReducedMotion();
  const movesPhoto = hasPhoto && !isReducedMotion;
  const open = useCallback(() => push(href), [href, push]);
  const openWithPhoto = useCallback(() => push(withPhotoZoomArrival(href)), [href, push]);
  if (MOVES_PHOTO_ON_THIS_PLATFORM) {
    return (
      <PhotoZoomContext value={movesPhoto}>
        {children(movesPhoto ? openWithPhoto : open)}
      </PhotoZoomContext>
    );
  }
  if (!ZOOMS_ON_THIS_PLATFORM) return children(open);
  // One tree on iOS, photo or not, so a card whose photo arrives late keeps
  // its surface: only the source around the photo comes and goes.
  return (
    <PhotoZoomContext value={movesPhoto}>
      <Link href={href} push asChild>
        <LinkPress render={children} />
      </Link>
    </PhotoZoomContext>
  );
}

/** The one Android image both ends of the move draw, so Reanimated pairs them. */
const SharedPhotoImage = Animated.createAnimatedComponent(Image);

/**
 * How many moves of a photo have ended, kept on the UI thread. The screen a
 * photo moves into watches it, so its sheet rises as the photo lands.
 */
const endedPhotoMoves = makeMutable(0);

/** The move of the photo, and back, in the time of an entrance. */
const sharedPhotoTransition = SharedTransition.duration(motionTokens.duration.slow)
  .reduceMotion(ReduceMotion.System)
  .withCallback(() => {
    'worklet';
    endedPhotoMoves.set(endedPhotoMoves.get() + 1);
  });

/** One tag per photo: the card and the screen it opens show the photo under the same key. */
function sharedPhotoTag(photoKey: string): string {
  return `photo-${photoKey}`;
}

/**
 * The child image drawn as the animated image. It is always the animated one
 * on Android, with or without a tag, so a tag that comes or goes never mounts
 * the photo again.
 */
function SharedPhoto({
  tag,
  image,
}: {
  readonly tag: string | undefined;
  readonly image: ReactElement<ImageProps>;
}) {
  return (
    <SharedPhotoImage
      {...image.props}
      sharedTransitionTag={tag}
      sharedTransitionStyle={sharedPhotoTransition}
    />
  );
}

/**
 * Around a card's photo. Its one child is an expo-image `Image` that takes a
 * single style object: the iOS zoom source copies its child and refuses a
 * style array in development.
 */
export function PhotoZoomSource({
  photoKey,
  children,
}: {
  /** The photo's stored key, the same the screen it opens shows its photo under. */
  readonly photoKey: string;
  readonly children: ReactElement<ImageProps>;
}) {
  const movesPhoto = use(PhotoZoomContext);
  if (MOVES_PHOTO_ON_THIS_PLATFORM) {
    return <SharedPhoto tag={movesPhoto ? sharedPhotoTag(photoKey) : undefined} image={children} />;
  }
  if (!movesPhoto) return children;
  return <Link.AppleZoom>{children}</Link.AppleZoom>;
}

/**
 * Around the photo the card's photo grows into. Only the photo: anything else
 * inside the target is dropped during the move, so the frame, the blurred
 * backdrop and the sheet stay outside it.
 */
export function PhotoZoomTarget({
  photoKey,
  children,
}: {
  /** The photo's stored key, the same the card showed its photo under. */
  readonly photoKey: string;
  readonly children: ReactElement<ImageProps>;
}) {
  const isReducedMotion = useReducedMotion();
  if (MOVES_PHOTO_ON_THIS_PLATFORM) {
    return (
      <SharedPhoto tag={isReducedMotion ? undefined : sharedPhotoTag(photoKey)} image={children} />
    );
  }
  return <Link.AppleZoomTarget>{children}</Link.AppleZoomTarget>;
}

/** The Android boundary of one screen: active while the screen is in front of her. */
function FocusedScreenBoundary({ children }: { readonly children: ReactNode }) {
  const isFocused = useIsFocused();
  return <SharedTransitionBoundary isActive={isFocused}>{children}</SharedTransitionBoundary>;
}

/**
 * Around a whole screen. A boundary around a navigator would stay active
 * while any of its screens shows and hide theirs, so a navigator gets none.
 */
export function PhotoZoomBoundary({ children }: { readonly children: ReactNode }) {
  if (!MOVES_PHOTO_ON_THIS_PLATFORM) return children;
  return <FocusedScreenBoundary>{children}</FocusedScreenBoundary>;
}

/**
 * The longest the sheet waits for its photo: a move that never starts, such as
 * a card scrolled away meanwhile, must not leave the screen empty.
 */
const PHOTO_LANDING_WAIT_LIMIT_MS = motionTokens.entrance.durationMs + motionTokens.duration.slow;

/** True once the photo that opened this screen has landed in it. */
function usePhotoLanded(waitsForPhoto: boolean): boolean {
  const [hasLanded, setHasLanded] = useState(!waitsForPhoto);
  const [movesBeforeArrival] = useState(() => endedPhotoMoves.get());
  useAnimatedReaction(
    () => endedPhotoMoves.get(),
    (endedMoves) => {
      if (waitsForPhoto && endedMoves !== movesBeforeArrival) runOnJS(setHasLanded)(true);
    },
    [waitsForPhoto, movesBeforeArrival],
  );
  useEffect(() => {
    if (!waitsForPhoto) return;
    const limit = setTimeout(() => setHasLanded(true), PHOTO_LANDING_WAIT_LIMIT_MS);
    return () => clearTimeout(limit);
  }, [waitsForPhoto]);
  return hasLanded;
}

/**
 * The sheet under a photo the card's photo moved into, on Android (RAPP-920).
 * The moving photo draws above the whole screen, so the sheet that overlaps
 * the photo's bottom edge stays out of view while the photo travels, then
 * rises and fades in over it as it lands. On the way back the sheet leaves
 * first, and the photo then shrinks into the card. With reduce motion, or on
 * a screen opened another way, the sheet is simply there.
 */
export function usePhotoZoomSheet() {
  const params = useLocalSearchParams();
  const isReducedMotion = useReducedMotion();
  const arrivesByZoom =
    MOVES_PHOTO_ON_THIS_PLATFORM && !isReducedMotion && arrivesByPhotoZoom(params);
  const hasLanded = usePhotoLanded(arrivesByZoom);
  const { progress, travel, onLayout } = useEntrance({
    ready: hasLanded,
    skip: !arrivesByZoom,
    continuesMove: true,
  });
  // The Android back button and back gesture reach the app here first: the
  // sheet leaves, then the screen goes back and the photo shrinks into its card.
  const isFocused = useIsFocused();
  const { back } = useRouter();
  const isLeaving = useRef(false);
  // The photo goes back filled to its frame, the way the card shows it.
  const [fillsFrameToLeave, setFillsFrameToLeave] = useState(false);
  useEffect(() => {
    if (!arrivesByZoom || !isFocused) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isLeaving.current) return true;
      isLeaving.current = true;
      setFillsFrameToLeave(true);
      progress.set(
        withTiming(0, { duration: motionTokens.duration.fast }, () => {
          runOnJS(back)();
        }),
      );
      return true;
    });
    return () => subscription.remove();
  }, [arrivesByZoom, back, isFocused, progress]);
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * travel }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  return { arrivesByZoom, sheetStyle, backdropStyle, onLayout, fillsFrameToLeave };
}
