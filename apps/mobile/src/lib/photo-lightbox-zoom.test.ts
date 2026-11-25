import { expect, test } from 'bun:test';
import {
  clampLightboxOffset,
  clampLightboxScale,
  fittedPhotoSize,
  LIGHTBOX_MAX_SCALE,
  LIGHTBOX_MIN_SCALE,
  lightboxAnchor,
  lightboxBackdropOpacity,
  lightboxOffsetKeepingAnchor,
  lightboxPanLimit,
  shouldDismissLightbox,
} from './photo-lightbox-zoom';

const PHONE_STAGE = { width: 400, height: 800 };

test('the photo fits whole inside the stage', () => {
  expect(fittedPhotoSize(PHONE_STAGE, 4 / 3)).toEqual({ width: 400, height: 300 });
  expect(fittedPhotoSize(PHONE_STAGE, 1 / 4)).toEqual({ width: 200, height: 800 });
  // Until the photo has loaded it fills the stage.
  expect(fittedPhotoSize(PHONE_STAGE, null)).toEqual(PHONE_STAGE);
});

test('the zoom stays between the fitted size and four times it', () => {
  expect(clampLightboxScale(0.5)).toBe(LIGHTBOX_MIN_SCALE);
  expect(clampLightboxScale(2)).toBe(2);
  expect(clampLightboxScale(9)).toBe(LIGHTBOX_MAX_SCALE);
});

test('a zoomed photo pans no further than its own edges', () => {
  // 300 points tall at scale 1 fits in 800: it cannot move up or down.
  expect(lightboxPanLimit(800, 300, 1)).toBe(0);
  // 400 wide at scale 2 is 800: 200 points each way.
  expect(lightboxPanLimit(400, 400, 2)).toBe(200);
  expect(clampLightboxOffset(350, 200)).toBe(200);
  expect(clampLightboxOffset(-350, 200)).toBe(-200);
  expect(clampLightboxOffset(50, 200)).toBe(50);
});

test('the point under the fingers stays under them while the zoom changes', () => {
  const anchor = lightboxAnchor({ focal: 300, stageLength: 400, offset: 0, scale: 1 });
  expect(anchor).toBe(100);
  const offset = lightboxOffsetKeepingAnchor({ focal: 300, stageLength: 400, anchor, scale: 2 });
  expect(offset).toBe(-100);
  // The same point, from the zoomed photo: still 300 points from the stage start.
  expect(400 / 2 + offset + anchor * 2).toBe(300);
});

test('a long drag or a fast flick closes the lightbox, a short one does not', () => {
  expect(shouldDismissLightbox({ translation: 200, velocity: 0, stageLength: 800 })).toBe(true);
  expect(shouldDismissLightbox({ translation: -200, velocity: 0, stageLength: 800 })).toBe(true);
  expect(shouldDismissLightbox({ translation: 40, velocity: 1500, stageLength: 800 })).toBe(true);
  expect(shouldDismissLightbox({ translation: 40, velocity: 200, stageLength: 800 })).toBe(false);
  // A flick back towards the centre keeps it open.
  expect(shouldDismissLightbox({ translation: 40, velocity: -1500, stageLength: 800 })).toBe(false);
});

test('the backdrop clears as the photo is dragged away', () => {
  expect(lightboxBackdropOpacity(0, 800)).toBe(1);
  expect(lightboxBackdropOpacity(200, 800)).toBe(0.5);
  expect(lightboxBackdropOpacity(-600, 800)).toBe(0);
});
