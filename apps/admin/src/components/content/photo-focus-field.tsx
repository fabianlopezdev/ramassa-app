/**
 * Choosing the part of a photo that cards keep (RAPP-932), in the Control
 * Center editors that take a photo: the avís and each photo of a service.
 *
 * The whole photo is shown with the card's frame over it, the rest dimmed. A
 * click or a drag on the photo moves the frame there, live; the arrow keys
 * move it too. Without a choice the frame shows the default crop and nothing
 * is stored. The reset goes back to it. Same rules as the phone's picker:
 * `@ramassa/shared/photo-focus`.
 */
import { useAuthenticatedMediaUrl } from '@/components/content/authenticated-media-image';
import { Button } from '@/components/ui/button';
import { mediaWorkerUrl } from '@/lib/media-worker';
import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import {
  photoCropWindow,
  photoFocusFromPoint,
  resolvePhotoFocus,
  type PhotoFocus,
} from '@ramassa/shared/photo-focus';
import { tokens } from '@ramassa/shared/tokens';

/** How far one arrow key moves the point across or down the photo. */
const KEYBOARD_STEP = 0.05;

const KEY_STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-KEYBOARD_STEP, 0],
  ArrowRight: [KEYBOARD_STEP, 0],
  ArrowUp: [0, -KEYBOARD_STEP],
  ArrowDown: [0, KEYBOARD_STEP],
};

function percent(value: number): string {
  return `${value * 100}%`;
}

/** A local link for a photo picked from the computer, released when it changes. */
function useFileObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (file === null) {
      setUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}

export interface PhotoFocusPickerProps {
  /** A displayable link to the whole photo. */
  readonly photoUrl: string;
  /** The chosen point; null shows the default crop and stores nothing. */
  readonly focus: PhotoFocus | null;
  readonly onChange: (focus: PhotoFocus | null) => void;
  readonly fieldId: string;
}

export function PhotoFocusPicker({ photoUrl, focus, onChange, fieldId }: PhotoFocusPickerProps) {
  const { t } = useTranslation('common');
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const frameAspectRatio = tokens.photoCard.aspectRatio;
  // Until the photo has loaded, its box takes the card's shape.
  const boxAspectRatio = aspectRatio ?? frameAspectRatio;
  const shown = resolvePhotoFocus(focus, aspectRatio);
  const window = photoCropWindow(shown, boxAspectRatio, frameAspectRatio);

  function measure(event: SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) setAspectRatio(naturalWidth / naturalHeight);
  }

  function chooseAt(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    onChange(
      photoFocusFromPoint(event.clientX - box.left, event.clientY - box.top, box.width, box.height),
    );
  }

  function moveByKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = KEY_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    onChange(photoFocusFromPoint(shown.x + step[0], shown.y + step[1], 1, 1));
  }

  const boxStyle: CSSProperties = { aspectRatio: boxAspectRatio };
  const frameStyle: CSSProperties = {
    left: percent(window.left),
    top: percent(window.top),
    width: percent(window.width),
    height: percent(window.height),
  };
  const frameBottom = window.top + window.height;
  const frameRight = window.left + window.width;
  const shades: readonly CSSProperties[] = [
    { left: 0, right: 0, top: 0, height: percent(window.top) },
    { left: 0, right: 0, top: percent(frameBottom), bottom: 0 },
    {
      left: 0,
      width: percent(window.left),
      top: percent(window.top),
      height: percent(window.height),
    },
    {
      left: percent(frameRight),
      right: 0,
      top: percent(window.top),
      height: percent(window.height),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium" id={`${fieldId}-focus-label`}>
        {t('photoFocus.label')}
      </span>
      {/* A photo is never mirrored, so its box runs left to right in every language. */}
      <div
        dir="ltr"
        role="slider"
        tabIndex={0}
        aria-labelledby={`${fieldId}-focus-label`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(shown.y * 100)}
        data-testid={`${fieldId}-focus`}
        className="relative w-full max-w-md cursor-crosshair touch-none overflow-hidden rounded-lg bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={boxStyle}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          chooseAt(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) chooseAt(event);
        }}
        onKeyDown={moveByKey}
      >
        <img
          src={photoUrl}
          alt=""
          draggable={false}
          onLoad={measure}
          className="pointer-events-none absolute inset-0 size-full object-contain"
        />
        {shades.map((shade, index) => (
          <div
            key={index}
            aria-hidden
            className="pointer-events-none absolute bg-black/50"
            style={shade}
          />
        ))}
        <div
          aria-hidden
          data-testid={`${fieldId}-focus-frame`}
          className="pointer-events-none absolute rounded-sm border-2 border-white"
          style={frameStyle}
        />
      </div>
      {focus === null ? null : (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          data-testid={`${fieldId}-focus-reset`}
          onClick={() => onChange(null)}
        >
          {t('photoFocus.reset')}
        </Button>
      )}
    </div>
  );
}

export interface PhotoFocusFieldProps {
  /** A photo picked and not uploaded yet; it wins over the stored one. */
  readonly file: File | null;
  /** The stored photo's object key. */
  readonly objectKey: string | null;
  readonly focus: PhotoFocus | null;
  readonly onChange: (focus: PhotoFocus | null) => void;
  readonly fieldId: string;
}

/** The picker for a picked or a stored photo; nothing until the photo can be shown. */
export function PhotoFocusField({
  file,
  objectKey,
  focus,
  onChange,
  fieldId,
}: PhotoFocusFieldProps) {
  const { session } = useAuth();
  const fileUrl = useFileObjectUrl(file);
  const storedUrl = useAuthenticatedMediaUrl(
    file === null ? objectKey : null,
    mediaWorkerUrl,
    session?.access_token,
  );
  const photoUrl = file === null ? storedUrl : fileUrl;
  return photoUrl === null ? null : (
    <PhotoFocusPicker photoUrl={photoUrl} focus={focus} onChange={onChange} fieldId={fieldId} />
  );
}
