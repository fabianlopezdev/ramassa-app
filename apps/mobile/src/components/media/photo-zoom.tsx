/**
 * A card's photo grows into the photo of the screen it opens (RAPP-916), the
 * way a pack opens in Ottermates: on iOS the native zoom transition carries
 * the photo from the card to the top of the next screen, and back on return.
 * Android and the web open the screen with their normal push.
 *
 * Three pieces, one per end of the move:
 * - `PhotoZoomLink` opens the card's screen. On iOS it is expo-router's `Link`,
 *   the only public way to mint a zoom transition: each `Link` makes its own
 *   identifier, adds it to the navigation when it carries a zoom source, and
 *   requires `asChild`. Elsewhere it is the same push the cards always made.
 * - `PhotoZoomSource` goes around the card's photo. Inside a `PhotoZoomLink`
 *   of a card with a photo it registers that photo as the zoom source.
 * - `PhotoZoomTarget` goes around the photo at the top of the opened screen
 *   (`PhotoHero`). Without a zoom it draws its photo untouched.
 *
 * With reduce motion on, the card opens with the plain push.
 */
import { Link, useRouter, type Href } from 'expo-router';
import { createContext, use, useCallback, type ReactElement, type ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

const ZOOMS_ON_THIS_PLATFORM = process.env.EXPO_OS === 'ios';

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
  const open = useCallback(() => push(href), [href, push]);
  if (!ZOOMS_ON_THIS_PLATFORM) return children(open);
  // One tree on iOS, photo or not, so a card whose photo arrives late keeps
  // its surface: only the source around the photo comes and goes.
  return (
    <PhotoZoomContext value={hasPhoto && !isReducedMotion}>
      <Link href={href} push asChild>
        <LinkPress render={children} />
      </Link>
    </PhotoZoomContext>
  );
}

/**
 * Around a card's photo. Its one child must take a single style object: the
 * zoom source copies its child and refuses a style array in development.
 */
export function PhotoZoomSource({ children }: { readonly children: ReactElement }) {
  const zooms = use(PhotoZoomContext);
  if (!zooms) return children;
  return <Link.AppleZoom>{children}</Link.AppleZoom>;
}

/**
 * Around the photo the card's photo grows into. Only the photo: anything else
 * inside the target is dropped during the move, so the frame, the blurred
 * backdrop and the sheet stay outside it.
 */
export function PhotoZoomTarget({ children }: { readonly children: ReactElement }) {
  return <Link.AppleZoomTarget>{children}</Link.AppleZoomTarget>;
}
