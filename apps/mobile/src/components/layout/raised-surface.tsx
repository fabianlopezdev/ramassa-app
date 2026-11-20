/**
 * The raised style of the player app (RAPP-826, RAPP-841), in one place: a
 * white face with a brand border, and a solid edge of the same colour peeking
 * out below and to the end. The choice surface, the segmented control and the
 * calendar build on these pieces, so the offsets and colours never drift.
 *
 * The wrapper keeps room for the edge, the edge sits absolute behind the face,
 * and the face holds the content. Face and edge share one shape class.
 */
import { useBrandColor } from '@/components/branding/organization-branding-context';
import { PressableDepth } from '@/components/motion/pressable-depth';
import { continuousCorners } from '@/lib/continuous-corners';
import type { HapticFeedback } from '@/lib/haptics/haptic-policy';
import { useMemo, type ReactNode } from 'react';
import {
  useWindowDimensions,
  View,
  type AccessibilityRole,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { sectionHue, sectionWash } from '@ramassa/shared/section-colors';
import { tokens } from '@ramassa/shared/tokens';

const { shadowInlineOffset, shadowBlockOffset } = tokens.languageChoice;

/** The corners of a card-sized raised surface, the same as a form field's. */
export const RAISED_SHAPE_CLASS_NAME = 'rounded-lg';

/**
 * A colour a raised surface can take on its face (RAPP-845, RAPP-893), such
 * as the kind of an announcement on Inici: the name of a section colour, shown
 * as its pale wash. The border and edge stay in the brand, and a chosen face
 * still fills with the secondary colour.
 */
export type RaisedTone = string;

/**
 * The tone a stored colour name stands for, such as a forum category's
 * `color` (RAPP-852); a name with no colour, like `neutral`, leaves the face white.
 */
export function raisedToneFromColorName(colorName: string): RaisedTone | undefined {
  return sectionHue(colorName) === undefined ? undefined : colorName;
}

/**
 * The solid wash of a section colour in this organization's brand (RAPP-893):
 * the shade a card's face and the screen it opens share. `undefined` for no
 * colour, so the surface keeps its own background.
 */
export function useSectionWash(colorName: string | undefined): string | undefined {
  const brandColor = useBrandColor();
  return useMemo(
    () => (colorName === undefined ? undefined : sectionWash(colorName, brandColor)),
    [brandColor, colorName],
  );
}

/** The outlined face: white, with the brand border, in the given shape. */
export function outlinedSurfaceClassName(shapeClassName = RAISED_SHAPE_CLASS_NAME): string {
  return `${shapeClassName} border border-primary bg-white`;
}

/** The pale wash of a tone over a white face, under its content. */
export function RaisedToneWash({ tone }: { readonly tone: RaisedTone | undefined }) {
  const wash = useSectionWash(tone);
  const style = useMemo(() => ({ backgroundColor: wash }), [wash]);
  if (wash === undefined) return null;
  return (
    <View pointerEvents="none" accessible={false} className="absolute inset-0" style={style} />
  );
}

/** The room the solid edge takes below and to the end of a raised face. */
export const raisedSurfaceWrapperStyle = {
  paddingEnd: shadowInlineOffset,
  paddingBottom: shadowBlockOffset,
} as const;

const raisedSurfaceEdgeStyle = {
  ...continuousCorners,
  position: 'absolute',
  top: shadowBlockOffset,
  start: shadowInlineOffset,
  end: 0,
  bottom: 0,
} as const;

/** A face as tall as a recommended tap target once its edge is added. */
export const RAISED_FACE_MIN_HEIGHT = tokens.tapTarget.recommended - shadowBlockOffset;

/**
 * A small raised button's face (RAPP-867), such as "Ara no" under a form: as
 * tall as the minimum tap target once its edge is added.
 */
export const RAISED_COMPACT_FACE_MIN_HEIGHT = tokens.tapTarget.min - shadowBlockOffset;

/**
 * The small square faces of a raised button that shows only its icon
 * (RAPP-884), such as reply and, one size down, report on a forum thread, with
 * smaller corners so they stay square buttons at these sizes.
 */
export const RAISED_ICON_FACE_SIZES = {
  regular: tokens.spacing.xl,
  small: tokens.spacing.lg + tokens.spacing.xs,
} as const;
export type RaisedIconFaceSize = keyof typeof RAISED_ICON_FACE_SIZES;
export const RAISED_ICON_SHAPE_CLASS_NAME = 'rounded-sm';

/**
 * How far the touch reaches past a small icon button, so its tap area is at
 * least a minimum tap target across and down. Above and below it reaches
 * evenly. Across, `startReach` sets the start side (for a button whose
 * neighbour sits at its start) and the end side takes the rest; without it,
 * both sides reach evenly. Start and end turn round when `isRightToLeft`.
 */
export function raisedIconHitSlop(
  face: RaisedIconFaceSize,
  startReach?: number,
  isRightToLeft = false,
): Insets {
  const width = RAISED_ICON_FACE_SIZES[face] + shadowInlineOffset;
  const height = RAISED_ICON_FACE_SIZES[face] + shadowBlockOffset;
  const across = tokens.tapTarget.min - width;
  const start = startReach ?? Math.ceil(across / 2);
  const end = Math.max(0, across - start);
  const vertical = Math.ceil((tokens.tapTarget.min - height) / 2);
  return isRightToLeft
    ? { top: vertical, bottom: vertical, left: end, right: start }
    : { top: vertical, bottom: vertical, left: start, right: end };
}

/**
 * How far the touch reaches past a small icon button with a neighbour on each
 * side, `halfGap` away: half the gap towards each, so the tap areas meet in the
 * middle of each gap. Above and below it still reaches to a full tap target.
 */
export function raisedIconHitSlopBetweenNeighbours(
  face: RaisedIconFaceSize,
  halfGap: number,
): Insets {
  const { top, bottom } = raisedIconHitSlop(face);
  return { top, bottom, left: halfGap, right: halfGap };
}

/**
 * The start reach of a small icon button whose only neighbour sits at its end,
 * `halfGap` away: its touch reaches only half the gap towards the neighbour, and
 * the rest of its full tap target reaches away from it, at the start.
 */
export function raisedIconStartReachBeforeNeighbour(
  face: RaisedIconFaceSize,
  halfGap: number,
): number {
  const even = raisedIconHitSlop(face, 0);
  return (even.left ?? 0) + (even.right ?? 0) - halfGap;
}

/**
 * The face of a raised choice (a picker card, the segmented control): as tall
 * as a form field once its edge is added, and taller with larger text.
 */
export function useRaisedChoiceFaceStyle() {
  const { fontScale } = useWindowDimensions();
  return useMemo(
    () => ({
      ...continuousCorners,
      minHeight: tokens.formField.minHeight * Math.max(1, fontScale) - shadowBlockOffset,
    }),
    [fontScale],
  );
}

/** The solid edge behind a raised face. */
export function RaisedSurfaceEdge({
  shapeClassName = RAISED_SHAPE_CLASS_NAME,
}: {
  readonly shapeClassName?: string;
}) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      className={`bg-primary ${shapeClassName}`}
      style={raisedSurfaceEdgeStyle}
    />
  );
}

/**
 * A raised surface that presses: the face sinks onto its edge on touch. With
 * `pressedFillClassName` the face also fills while it is held down.
 */
export function RaisedPressable({
  children,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  isSelected,
  testID,
  onPress,
  haptic = 'selection',
  className,
  faceClassName,
  faceStyle,
  pressedFillClassName,
  shapeClassName = RAISED_SHAPE_CLASS_NAME,
}: {
  readonly children: ReactNode;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string;
  readonly accessibilityRole?: AccessibilityRole;
  readonly isSelected?: boolean;
  readonly testID?: string;
  readonly onPress: () => void;
  readonly haptic?: HapticFeedback;
  /** For the whole control, edge included, such as the dimming of a locked one. */
  readonly className?: string;
  readonly faceClassName?: string;
  /** A hoisted style for the face; include the continuous corners. */
  readonly faceStyle?: StyleProp<ViewStyle>;
  readonly pressedFillClassName?: string;
  readonly shapeClassName?: string;
}) {
  return (
    <PressableDepth
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      isSelected={isSelected}
      onPress={onPress}
      haptic={haptic}
      style={raisedSurfaceWrapperStyle}
      className={className === undefined ? 'relative' : `relative ${className}`}
      faceStyle={faceStyle ?? continuousCorners}
      faceClassName={`relative overflow-hidden ${outlinedSurfaceClassName(shapeClassName)} ${
        faceClassName ?? ''
      }`}
      inlineOffset={shadowInlineOffset}
      blockOffset={shadowBlockOffset}
      pressedFillClassName={pressedFillClassName}
      shadow={<RaisedSurfaceEdge shapeClassName={shapeClassName} />}
    >
      {children}
    </PressableDepth>
  );
}
