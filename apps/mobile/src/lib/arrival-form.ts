/**
 * The pure rules of the goods-received form (RAPP-250), apart from React so
 * they are tested on their own.
 */
import {
  ARRIVAL_MAX_QUANTITY,
  centsToEuroText,
  parseEuroCents,
  type ArrivalSource,
} from '@ramassa/shared/equipment';

export interface ArrivalDraftLine {
  readonly itemTypeId: string;
  readonly itemKey: string;
  readonly size: string | null;
  readonly quantity: number;
  readonly unitValueCents: number | null;
}

/** The value pre-filled for an item: its usual value, except on a purchase, where the price is typed. */
export function prefilledValue(source: ArrivalSource, defaultValueCents: number | null): string {
  return source === 'purchase' ? '' : centsToEuroText(defaultValueCents);
}

export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(ARRIVAL_MAX_QUANTITY, Math.max(1, Math.round(value)));
}

/**
 * Adds a line. The same item, size and value already in the list grows by the
 * new quantity, so ten boots typed as 6 then 4 read as one line of 10.
 */
export function addArrivalLine(
  lines: readonly ArrivalDraftLine[],
  line: ArrivalDraftLine,
): readonly ArrivalDraftLine[] {
  const index = lines.findIndex(
    (candidate) =>
      candidate.itemTypeId === line.itemTypeId &&
      candidate.size === line.size &&
      candidate.unitValueCents === line.unitValueCents,
  );
  if (index === -1) return [...lines, line];
  return lines.map((candidate, at) =>
    at === index
      ? { ...candidate, quantity: clampQuantity(candidate.quantity + line.quantity) }
      : candidate,
  );
}

/** Empty is "no value typed"; anything else must read as a price. */
export function readValue(text: string): { readonly ok: boolean; readonly cents: number | null } {
  if (text.trim() === '') return { ok: true, cents: null };
  const cents = parseEuroCents(text);
  return cents === null ? { ok: false, cents: null } : { ok: true, cents };
}

export type ArrivalBlocker = 'offline' | 'no-lines' | 'uploading' | 'bad-total';

/** Why Save is off, or null when the arrival can be saved. */
export function arrivalBlocker(input: {
  readonly isOnline: boolean;
  readonly lineCount: number;
  readonly uploadingPhotos: number;
  readonly totalCostText: string;
}): ArrivalBlocker | null {
  if (!input.isOnline) return 'offline';
  if (input.lineCount === 0) return 'no-lines';
  if (input.uploadingPhotos > 0) return 'uploading';
  if (!readValue(input.totalCostText).ok) return 'bad-total';
  return null;
}
