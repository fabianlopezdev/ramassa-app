/**
 * The fade at the foot of a photo that white text sits on, the look of the
 * card photo (RAPP-921): clear at the top, mostly the colour by the middle,
 * solid under the last line, so white text reads on any photo. A gallery tile
 * fades into the brand colour (RAPP-931); the lightbox fades into its black.
 */
import { useMemo, type ReactNode } from 'react';
import { View, type ViewProps, type ViewStyle } from 'react-native';

/** The colour as six hex digits, followed by two more for its opacity. */
export function photoFadeGradient(color: string): string {
  return `linear-gradient(to bottom, ${color}00, ${color}B3 45%, ${color} 85%)`;
}

export function PhotoFade({
  color,
  className,
  pointerEvents = 'none',
  testID,
  children,
}: {
  /** A token or brand colour, `#RRGGBB`. */
  readonly color: string;
  readonly className?: string;
  /** No touch by default: the photo under it takes the tap. */
  readonly pointerEvents?: ViewProps['pointerEvents'];
  readonly testID?: string;
  readonly children: ReactNode;
}) {
  const style = useMemo<ViewStyle>(() => ({ backgroundImage: photoFadeGradient(color) }), [color]);
  return (
    <View testID={testID} pointerEvents={pointerEvents} style={style} className={className}>
      {children}
    </View>
  );
}
