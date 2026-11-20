/**
 * The app's icon (RAPP-834): one drawing on iPhone and on Android, from the
 * set kept in `docs/design/icons/svg`.
 *
 *   <Icon name="chevron-right" size={tokens.fontSize.xl} color={brandColor} />
 *   <Icon name="clipboard" weight="boldDuotone" size={tokens.spacing['2xl']} color={brandColor} />
 *
 * `name` is our own vocabulary, generated from the folder, so a change of
 * drawing never touches a screen.
 *
 * An icon beside a label is hidden from a screen reader. One that carries
 * meaning by itself takes a `label` and is announced as an image.
 *
 * An icon is a picture and makes no touch target; the control around it does.
 */
import { I18nManager } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { tokens } from '@ramassa/shared/tokens';
import { ICON_GRID, iconPaths, type IconName, type IconWeight } from './icon-set';

const VIEW_BOX = `0 0 ${ICON_GRID} ${ICON_GRID}`;

/**
 * Solar draws each icon inside a margin of this many grid units (its 20-unit
 * live area), so an icon carries that empty margin on every side.
 */
const ICON_ARTWORK_MARGIN = 2;

/**
 * Pictures that point along the reading direction, so they turn round in
 * Arabic and Farsi (RAPP-884): the reply arrow points back to the start.
 */
const MIRRORED_IN_RIGHT_TO_LEFT: ReadonlySet<IconName> = new Set<IconName>(['reply']);
const MIRROR_TRANSFORM = `scale(-1, 1) translate(-${ICON_GRID}, 0)`;

/** The empty margin around an icon's artwork at a size, in points (RAPP-852). */
export function iconArtworkMargin(size: number): number {
  return (size * ICON_ARTWORK_MARGIN) / ICON_GRID;
}

interface IconProps {
  readonly name: IconName;
  /** `linear` for rows and arrows; `boldDuotone` where the icon is the subject. */
  readonly weight?: IconWeight;
  /** In points, from a size token. */
  readonly size?: number;
  /** One colour; the two-tone weight draws its second layer in the same colour at half strength. */
  readonly color?: string;
  /** Present: the icon is announced. Absent: it is decoration. */
  readonly label?: string;
}

export function Icon({
  name,
  weight = 'linear',
  size = tokens.fontSize.xl,
  color = tokens.colors.neutral[900],
  label,
}: IconProps) {
  const isAnnounced = label !== undefined;
  const paths = iconPaths(name, weight).map((path) => (
    <Path
      key={path.d}
      d={path.d}
      fill={path.mode === 'fill' ? color : 'none'}
      fillRule={path.mode === 'fill' ? path.fillRule : undefined}
      opacity={path.opacity}
      stroke={path.mode === 'stroke' ? color : undefined}
      strokeLinecap={path.cap}
      strokeLinejoin={path.join}
      // Drawn on the 24-point grid and scaled with it, so the line keeps its weight at any size.
      strokeWidth={path.width}
    />
  ));
  return (
    <Svg
      accessible={isAnnounced}
      accessibilityRole={isAnnounced ? 'image' : undefined}
      accessibilityLabel={label}
      aria-hidden={isAnnounced ? undefined : true}
      importantForAccessibility={isAnnounced ? 'yes' : 'no-hide-descendants'}
      width={size}
      height={size}
      viewBox={VIEW_BOX}
    >
      {I18nManager.isRTL && MIRRORED_IN_RIGHT_TO_LEFT.has(name) ? (
        <G transform={MIRROR_TRANSFORM}>{paths}</G>
      ) : (
        paths
      )}
    </Svg>
  );
}

export { ICON_LICENCE } from './icon-set';
export type { IconName, IconWeight } from './icon-set';
