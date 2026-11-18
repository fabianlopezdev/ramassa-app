/**
 * The raised style of the player app (RAPP-826, RAPP-841), in one place: a
 * white face with a brand border, and a solid edge of the same colour peeking
 * out below and to the end. The choice surface, the segmented control and the
 * calendar build on these pieces, so the offsets and colours never drift.
 *
 * The wrapper keeps room for the edge, the edge sits absolute behind the face,
 * and the face holds the content. Face and edge share one shape class.
 */
import { continuousCorners } from '@/lib/continuous-corners';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const { shadowInlineOffset, shadowBlockOffset } = tokens.languageChoice;

/** The corners of a card-sized raised surface, the same as a form field's. */
export const RAISED_SHAPE_CLASS_NAME = 'rounded-lg';

/** The outlined face: white, with the brand border, in the given shape. */
export function outlinedSurfaceClassName(shapeClassName = RAISED_SHAPE_CLASS_NAME): string {
  return `${shapeClassName} border border-primary bg-white`;
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

/** A raised surface that does not press: it holds controls that press on their own. */
export function RaisedPanel({
  children,
  faceClassName,
  faceStyle = continuousCorners,
  shapeClassName = RAISED_SHAPE_CLASS_NAME,
}: {
  readonly children: ReactNode;
  readonly faceClassName?: string;
  /** A hoisted style for the face; it replaces the default continuous corners, so include them. */
  readonly faceStyle?: StyleProp<ViewStyle>;
  readonly shapeClassName?: string;
}) {
  return (
    <View style={raisedSurfaceWrapperStyle} className="relative">
      <RaisedSurfaceEdge shapeClassName={shapeClassName} />
      <View
        className={`${outlinedSurfaceClassName(shapeClassName)} ${faceClassName ?? ''}`}
        style={faceStyle}
      >
        {children}
      </View>
    </View>
  );
}
