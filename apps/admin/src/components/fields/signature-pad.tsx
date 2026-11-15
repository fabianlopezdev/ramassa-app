/**
 * A signature drawn on the web (RAPP-690): the entity person signs a
 * signature block of the referral form with a mouse, a pen or a finger. The
 * strokes are kept scaled to 0..1000 on both axes, the format of her phone's
 * pad (`apps/mobile/src/components/equipment/signature-pad.tsx`), so every
 * stored signature draws the same anywhere. Pointer events, no dependency.
 */

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRef, useState, type PointerEvent } from 'react';
import {
  SIGNATURE_MAX_POINTS,
  SIGNATURE_SCALE,
  type SignatureStrokes,
} from '@ramassa/shared/equipment';

/** Points closer than this (in pad units) add nothing a person can see. */
const MIN_STEP = 4;

type Point = [number, number];

function pointOf(event: PointerEvent<HTMLDivElement>): Point {
  const box = event.currentTarget.getBoundingClientRect();
  const scale = (value: number, size: number) =>
    Math.min(
      SIGNATURE_SCALE,
      Math.max(0, Math.round((value / Math.max(size, 1)) * SIGNATURE_SCALE)),
    );
  return [scale(event.clientX - box.left, box.width), scale(event.clientY - box.top, box.height)];
}

export function WebSignaturePad({
  strokes,
  onChange,
  label,
  prompt,
  clearLabel,
  isInvalid = false,
  testId,
}: {
  readonly strokes: SignatureStrokes | null;
  readonly onChange: (strokes: SignatureStrokes | null) => void;
  /** The pad's accessible name. */
  readonly label: string;
  /** "Sign here", shown while the pad is empty. */
  readonly prompt: string;
  readonly clearLabel: string;
  readonly isInvalid?: boolean;
  readonly testId: string;
}) {
  const [drawing, setDrawing] = useState<Point[] | null>(null);
  const drawingRef = useRef<Point[] | null>(null);
  const shown = [...(strokes ?? []), ...(drawing === null ? [] : [drawing])];
  const pointCount = (strokes ?? []).reduce((total, stroke) => total + stroke.length, 0);

  function finish() {
    const stroke = drawingRef.current;
    drawingRef.current = null;
    setDrawing(null);
    if (stroke === null || stroke.length === 0) return;
    onChange([...(strokes ?? []), stroke] as SignatureStrokes);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={label}
        aria-invalid={isInvalid}
        className={cn(
          'relative h-40 w-full touch-none rounded-md border border-dashed bg-background select-none',
          isInvalid ? 'border-destructive' : 'border-input',
        )}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const stroke: Point[] = [pointOf(event)];
          drawingRef.current = stroke;
          setDrawing(stroke);
        }}
        onPointerMove={(event) => {
          const stroke = drawingRef.current;
          if (stroke === null) return;
          const next = pointOf(event);
          const last = stroke[stroke.length - 1] as Point;
          if (Math.hypot(next[0] - last[0], next[1] - last[1]) < MIN_STEP) return;
          if (pointCount + stroke.length >= SIGNATURE_MAX_POINTS) return;
          const grown = [...stroke, next];
          drawingRef.current = grown;
          setDrawing(grown);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        data-testid={testId}
      >
        {shown.length === 0 ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {prompt}
          </span>
        ) : null}
        <svg
          aria-hidden
          viewBox={`0 0 ${SIGNATURE_SCALE} ${SIGNATURE_SCALE}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
        >
          {shown.map((stroke, index) => (
            <polyline
              key={index}
              points={(stroke.length === 1 ? [stroke[0], stroke[0]] : stroke)
                .map((point) => `${point?.[0]},${point?.[1]}`)
                .join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      {strokes === null ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => onChange(null)}
          data-testid={`${testId}-clear`}
        >
          {clearLabel}
        </Button>
      )}
    </div>
  );
}
