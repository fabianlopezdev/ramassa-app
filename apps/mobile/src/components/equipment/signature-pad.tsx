/**
 * Her signature, drawn with her finger on the staff phone (RAPP-249). The
 * strokes are kept scaled to 0..1000 on both axes, so the stored signature
 * draws the same on any screen. While she draws, the screen around the pad
 * must not scroll: `onDrawingChange` tells the parent when to hold it.
 */
import { continuousCorners } from '@/lib/continuous-corners';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  SIGNATURE_MAX_POINTS,
  SIGNATURE_SCALE,
  type SignatureStrokes,
} from '@ramassa/shared/equipment';
import { tokens } from '@ramassa/shared/tokens';

const PAD_HEIGHT = 220;
const STROKE_WIDTH = 3;
/** Points closer than this (in pad units) add nothing a person can see. */
const MIN_STEP = 4;

type Point = [number, number];
type Stroke = Point[];

const padStyle = { height: PAD_HEIGHT } as const;

function strokePath(stroke: readonly Point[], width: number, height: number): string {
  return stroke
    .map(([x, y], index) => {
      const px = ((x / SIGNATURE_SCALE) * width).toFixed(1);
      const py = ((y / SIGNATURE_SCALE) * height).toFixed(1);
      // A single tap is a dot: a zero-length line with round caps.
      return index === 0
        ? `M${px} ${py}${stroke.length === 1 ? ` L${px} ${py}` : ''}`
        : `L${px} ${py}`;
    })
    .join(' ');
}

export function SignaturePad({
  strokes,
  onChange,
  onDrawingChange,
  prompt,
  promptClassName,
  accessibilityLabel,
}: {
  readonly strokes: SignatureStrokes | null;
  readonly onChange: (strokes: SignatureStrokes | null) => void;
  readonly onDrawingChange?: (isDrawing: boolean) => void;
  /** "Sign here" in her language, shown while the pad is empty. */
  readonly prompt: string;
  readonly promptClassName: string;
  readonly accessibilityLabel: string;
}) {
  const [size, setSize] = useState({ width: 0, height: PAD_HEIGHT });
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const live = useRef<{ strokes: Stroke[]; current: Stroke | null }>({
    strokes: [],
    current: null,
  });
  live.current.strokes = (strokes as Stroke[] | null) ?? [];

  const toPoint = useCallback(
    (event: GestureResponderEvent): Point | null => {
      if (size.width === 0) return null;
      const clamp = (value: number) => Math.min(SIGNATURE_SCALE, Math.max(0, Math.round(value)));
      return [
        clamp((event.nativeEvent.locationX / size.width) * SIGNATURE_SCALE),
        clamp((event.nativeEvent.locationY / size.height) * SIGNATURE_SCALE),
      ];
    },
    [size],
  );

  const pointCount = useCallback(
    () =>
      live.current.strokes.reduce((total, stroke) => total + stroke.length, 0) +
      (live.current.current?.length ?? 0),
    [],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          const point = toPoint(event);
          if (point === null || pointCount() >= SIGNATURE_MAX_POINTS) return;
          live.current.current = [point];
          setDrawing([point]);
          onDrawingChange?.(true);
        },
        onPanResponderMove: (event) => {
          const current = live.current.current;
          const point = toPoint(event);
          if (current === null || point === null || pointCount() >= SIGNATURE_MAX_POINTS) return;
          const last = current[current.length - 1]!;
          if (Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_STEP) return;
          current.push(point);
          setDrawing([...current]);
        },
        onPanResponderRelease: () => {
          const current = live.current.current;
          live.current.current = null;
          setDrawing(null);
          onDrawingChange?.(false);
          if (current !== null) onChange([...live.current.strokes, current]);
        },
        onPanResponderTerminate: () => {
          live.current.current = null;
          setDrawing(null);
          onDrawingChange?.(false);
        },
      }),
    [onChange, onDrawingChange, pointCount, toPoint],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const shown = [...(live.current.strokes as Stroke[]), ...(drawing === null ? [] : [drawing])];
  const isEmpty = shown.length === 0;

  return (
    <View
      testID="signature-pad"
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: isEmpty ? '' : '✓' }}
      onLayout={handleLayout}
      style={[padStyle, continuousCorners]}
      className="overflow-hidden rounded-md border-2 border-dashed border-neutral-400 bg-white"
      {...responder.panHandlers}
    >
      {isEmpty ? (
        <View pointerEvents="none" className="flex-1 items-center justify-center p-md">
          <Text className={`text-center text-lg text-neutral-500 ${promptClassName}`}>
            {prompt}
          </Text>
        </View>
      ) : (
        <Svg width={size.width} height={size.height} pointerEvents="none">
          {shown.map((stroke, index) => (
            <Path
              // Strokes only grow at the end, so the index is a stable key.
              key={index}
              d={strokePath(stroke, size.width, size.height)}
              stroke={tokens.colors.neutral[900]}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      )}
    </View>
  );
}

/** How much smaller the saved signature is drawn than the pad it was drawn on. */
const PREVIEW_SCALE = 0.6;

/**
 * A saved signature, read only, on her material history (RAPP-283). Drawn at
 * the pad's proportions so it keeps the shape she drew.
 */
export function SignaturePreview({
  strokes,
  accessibilityLabel,
}: {
  readonly strokes: SignatureStrokes;
  readonly accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const height = PAD_HEIGHT * PREVIEW_SCALE;
  const drawWidth = width * PREVIEW_SCALE;
  const previewStyle = useMemo(() => ({ width: drawWidth, height }), [drawWidth, height]);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    >
      {width === 0 ? null : (
        <View
          style={[previewStyle, continuousCorners]}
          className="overflow-hidden rounded-md border border-neutral-200 bg-white"
        >
          <Svg width={drawWidth} height={height} pointerEvents="none">
            {strokes.map((stroke, index) => (
              <Path
                // A saved signature never changes, so the index is a stable key.
                key={index}
                d={strokePath(stroke, drawWidth, height)}
                stroke={tokens.colors.neutral[900]}
                strokeWidth={STROKE_WIDTH * PREVIEW_SCALE}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        </View>
      )}
    </View>
  );
}
