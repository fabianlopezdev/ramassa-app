import { describe, expect, test } from 'bun:test';
import {
  defaultPhotoFocus,
  photoCropWindow,
  photoFocusColumns,
  photoFocusFromColumns,
  photoFocusFromPoint,
  photoFocusPercentages,
  photoFocusSchema,
  resolvePhotoFocus,
  TALL_PHOTO_DEFAULT_FOCUS,
  WIDE_PHOTO_DEFAULT_FOCUS,
} from './photo-focus';

const CARD = 16 / 9;

describe('photoFocusSchema', () => {
  test('a point inside the photo, both numbers between 0 and 1', () => {
    expect(photoFocusSchema.safeParse({ x: 0, y: 1 }).success).toBe(true);
    expect(photoFocusSchema.safeParse({ x: 0.5, y: 0.333 }).success).toBe(true);
    expect(photoFocusSchema.safeParse({ x: 1.01, y: 0.5 }).success).toBe(false);
    expect(photoFocusSchema.safeParse({ x: 0.5, y: -0.01 }).success).toBe(false);
    expect(photoFocusSchema.safeParse({ x: Number.NaN, y: 0.5 }).success).toBe(false);
    expect(photoFocusSchema.safeParse({ x: 0.5 }).success).toBe(false);
  });
});

describe('the default crop', () => {
  test('a tall photo keeps its top third', () => {
    expect(defaultPhotoFocus(800 / 1200)).toEqual(TALL_PHOTO_DEFAULT_FOCUS);
    expect(TALL_PHOTO_DEFAULT_FOCUS.x).toBe(0.5);
    expect(TALL_PHOTO_DEFAULT_FOCUS.y).toBeCloseTo(1 / 3);
  });

  test('a wide or square photo keeps its middle', () => {
    expect(defaultPhotoFocus(1200 / 800)).toEqual(WIDE_PHOTO_DEFAULT_FOCUS);
    expect(defaultPhotoFocus(1)).toEqual({ x: 0.5, y: 0.5 });
  });

  test('a photo whose shape is not known yet keeps its top third', () => {
    expect(defaultPhotoFocus(null)).toEqual(TALL_PHOTO_DEFAULT_FOCUS);
  });

  test('a chosen focus wins over the default, whatever the shape', () => {
    expect(resolvePhotoFocus({ x: 0.2, y: 0.9 }, 800 / 1200)).toEqual({ x: 0.2, y: 0.9 });
    expect(resolvePhotoFocus(null, 1200 / 800)).toEqual(WIDE_PHOTO_DEFAULT_FOCUS);
  });
});

describe('stored columns', () => {
  test('two numbers make a focus; a missing one makes none', () => {
    expect(photoFocusFromColumns(0.5, 0.25)).toEqual({ x: 0.5, y: 0.25 });
    expect(photoFocusFromColumns(null, null)).toBeNull();
    expect(photoFocusFromColumns(0.5, null)).toBeNull();
  });

  test('the same stored numbers give the same focus, so memoised cards keep it', () => {
    expect(photoFocusFromColumns(0.4, 0.6)).toBe(photoFocusFromColumns(0.4, 0.6));
  });

  test('a focus goes back to two columns, and no choice to two nulls', () => {
    expect(photoFocusColumns({ x: 0.1, y: 0.2 })).toEqual({ x: 0.1, y: 0.2 });
    expect(photoFocusColumns(null)).toEqual({ x: null, y: null });
  });
});

describe('photoFocusFromPoint', () => {
  test('a tap on the photo becomes a point across and down it', () => {
    expect(photoFocusFromPoint(150, 100, 300, 400)).toEqual({ x: 0.5, y: 0.25 });
  });

  test('a drag past the edge stays on the photo', () => {
    expect(photoFocusFromPoint(-20, 500, 300, 400)).toEqual({ x: 0, y: 1 });
  });

  test('stored with three decimals', () => {
    expect(photoFocusFromPoint(100, 100, 300, 300)).toEqual({ x: 0.333, y: 0.333 });
  });

  test('a photo with no size yet gives the middle', () => {
    expect(photoFocusFromPoint(10, 10, 0, 0)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('photoFocusPercentages', () => {
  test('the focus as the position of the photo in its frame', () => {
    expect(photoFocusPercentages({ x: 0.5, y: 1 / 3 })).toEqual({ left: '50%', top: '33.3%' });
    expect(photoFocusPercentages({ x: 0, y: 1 })).toEqual({ left: '0%', top: '100%' });
  });
});

describe('photoCropWindow', () => {
  test('a tall photo in the card keeps a band across its whole width', () => {
    const window = photoCropWindow({ x: 0.5, y: 0 }, 800 / 1200, CARD);
    expect(window.left).toBe(0);
    expect(window.width).toBe(1);
    expect(window.top).toBe(0);
    expect(window.height).toBeCloseTo(0.375);
  });

  test('the band slides down with the focus and stops at the foot', () => {
    expect(photoCropWindow({ x: 0.5, y: 1 }, 800 / 1200, CARD).top).toBeCloseTo(0.625);
    expect(photoCropWindow({ x: 0.5, y: 0.5 }, 800 / 1200, CARD).top).toBeCloseTo(0.3125);
  });

  test('the chosen point is always inside what the card keeps', () => {
    for (const y of [0, 0.1, 0.33, 0.5, 0.8, 1]) {
      const window = photoCropWindow({ x: 0.5, y }, 3 / 4, CARD);
      expect(y).toBeGreaterThanOrEqual(window.top);
      expect(y).toBeLessThanOrEqual(window.top + window.height + 1e-9);
    }
  });

  test('a photo wider than the card keeps a band down its whole height', () => {
    const window = photoCropWindow({ x: 1, y: 0.5 }, 3, CARD);
    expect(window.top).toBe(0);
    expect(window.height).toBe(1);
    expect(window.width).toBeCloseTo(CARD / 3);
    expect(window.left).toBeCloseTo(1 - CARD / 3);
  });

  test('a photo of the card shape is kept whole', () => {
    expect(photoCropWindow({ x: 0.1, y: 0.9 }, CARD, CARD)).toEqual({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
  });
});
