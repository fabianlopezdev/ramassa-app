/**
 * The raised style of the player app (RAPP-826, RAPP-841), in one place: a
 * white face with a brand border, and a solid edge of the same colour peeking
 * out below and to the end. The choice surface, the segmented control and the
 * calendar build on these pieces, so the offsets and colours never drift.
 *
 * The wrapper keeps room for the edge, the edge sits absolute behind the face,
 * and the face holds the content. Face and edge share one shape class.
 */
import { PressableDepth } from '@/components/motion/pressable-depth';
import { continuousCorners } from '@/lib/continuous-corners';
import type { HapticFeedback } from '@/lib/haptics/haptic-policy';
import { useMemo, type ReactNode } from 'react';
import {
  useWindowDimensions,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const { shadowInlineOffset, shadowBlockOffset } = tokens.languageChoice;

/** The corners of a card-sized raised surface, the same as a form field's. */
export const RAISED_SHAPE_CLASS_NAME = 'rounded-lg';

/**
 * A colour a raised surface can take on its face (RAPP-845), such as the kind
 * of an announcement on Inici. The face is a pale wash of the colour, and a
 * chosen face fills with it. The border and edge stay in the brand.
 */
const raisedToneClasses = {
  primary: {
    wash: 'bg-primary/10',
    fill: 'bg-primary',
    text: 'text-neutral-900',
    filledText: 'text-white',
  },
  secondary: {
    wash: 'bg-secondary/25',
    fill: 'bg-secondary-dark',
    text: 'text-neutral-900',
    filledText: 'text-neutral-900',
  },
  error: {
    wash: 'bg-error/10',
    fill: 'bg-error',
    text: 'text-neutral-900',
    filledText: 'text-white',
  },
  info: {
    wash: 'bg-info/10',
    fill: 'bg-info',
    text: 'text-neutral-900',
    // White on the info blue is under 4.5:1, dark text is above it.
    filledText: 'text-neutral-900',
  },
} as const;

export type RaisedTone = keyof typeof raisedToneClasses;

export function raisedToneClassNames(tone: RaisedTone) {
  return raisedToneClasses[tone];
}

/** The outlined face: white, with the brand border, in the given shape. */
export function outlinedSurfaceClassName(shapeClassName = RAISED_SHAPE_CLASS_NAME): string {
  return `${shapeClassName} border border-primary bg-white`;
}

/** The pale wash of a tone over a white face, under its content. */
export function RaisedToneWash({ tone }: { readonly tone: RaisedTone | undefined }) {
  if (tone === undefined) return null;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      className={`absolute inset-0 ${raisedToneClasses[tone].wash}`}
    />
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
  accessibilityRole = 'button',
  isSelected,
  testID,
  onPress,
  haptic = 'selection',
  faceClassName,
  faceStyle,
  pressedFillClassName,
  shapeClassName = RAISED_SHAPE_CLASS_NAME,
}: {
  readonly children: ReactNode;
  readonly accessibilityLabel: string;
  readonly accessibilityRole?: AccessibilityRole;
  readonly isSelected?: boolean;
  readonly testID?: string;
  readonly onPress: () => void;
  readonly haptic?: HapticFeedback;
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
      accessibilityRole={accessibilityRole}
      isSelected={isSelected}
      onPress={onPress}
      haptic={haptic}
      style={raisedSurfaceWrapperStyle}
      className="relative"
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
