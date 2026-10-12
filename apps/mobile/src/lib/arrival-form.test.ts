import { describe, expect, test } from 'bun:test';
import {
  addArrivalLine,
  arrivalBlocker,
  clampQuantity,
  prefilledValue,
  readValue,
  type ArrivalDraftLine,
} from './arrival-form';

const boots: ArrivalDraftLine = {
  itemTypeId: 't-boots',
  itemKey: 'boots',
  size: '40',
  quantity: 6,
  unitValueCents: 2500,
};

describe('prefilledValue', () => {
  test('a donation or sponsorship starts at the usual value; a purchase starts empty', () => {
    expect(prefilledValue('donation', 2500)).toBe('25');
    expect(prefilledValue('sponsor', 1250)).toBe('12,50');
    expect(prefilledValue('purchase', 2500)).toBe('');
    expect(prefilledValue('donation', null)).toBe('');
  });
});

describe('addArrivalLine', () => {
  test('the same item, size and value grows into one line', () => {
    expect(addArrivalLine([boots], { ...boots, quantity: 4 })).toEqual([
      { ...boots, quantity: 10 },
    ]);
  });

  test('another size or value is a line of its own', () => {
    expect(addArrivalLine([boots], { ...boots, size: '41' })).toHaveLength(2);
    expect(addArrivalLine([boots], { ...boots, unitValueCents: 2000 })).toHaveLength(2);
  });
});

describe('clampQuantity', () => {
  test('keeps a quantity between 1 and 10,000', () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(Number.NaN)).toBe(1);
    expect(clampQuantity(20_000)).toBe(10_000);
  });
});

describe('readValue', () => {
  test('empty is no value; a price is cents; anything else is refused', () => {
    expect(readValue(' ')).toEqual({ ok: true, cents: null });
    expect(readValue('12,50')).toEqual({ ok: true, cents: 1250 });
    expect(readValue('twelve').ok).toBe(false);
  });
});

describe('arrivalBlocker', () => {
  const ready = { isOnline: true, lineCount: 1, uploadingPhotos: 0, totalCostText: '' };

  test('ready to save', () => {
    expect(arrivalBlocker(ready)).toBeNull();
  });

  test('says why Save is off', () => {
    expect(arrivalBlocker({ ...ready, isOnline: false })).toBe('offline');
    expect(arrivalBlocker({ ...ready, lineCount: 0 })).toBe('no-lines');
    expect(arrivalBlocker({ ...ready, uploadingPhotos: 1 })).toBe('uploading');
    expect(arrivalBlocker({ ...ready, totalCostText: 'x' })).toBe('bad-total');
  });
});
