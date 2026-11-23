import { expect, test } from 'bun:test';
import {
  LIGHTBOX_DRAG_SIDEWAYS,
  LIGHTBOX_DRAG_UNDECIDED,
  LIGHTBOX_DRAG_UPRIGHT,
  lightboxDragAxis,
  lightboxDragPosition,
  lightboxPageAfterDrag,
  lightboxPageDirection,
} from './photo-lightbox-paging';

const STRIDE = 424;
const LEFT_TO_RIGHT = lightboxPageDirection(false);
const RIGHT_TO_LEFT = lightboxPageDirection(true);

test('the next photo comes from the right, and from the left in Arabic and Farsi', () => {
  expect(LEFT_TO_RIGHT).toBe(1);
  expect(RIGHT_TO_LEFT).toBe(-1);
});

test('a drag is sideways or upright from its first movement', () => {
  expect(lightboxDragAxis(0, 0)).toBe(LIGHTBOX_DRAG_UNDECIDED);
  expect(lightboxDragAxis(-12, 4)).toBe(LIGHTBOX_DRAG_SIDEWAYS);
  expect(lightboxDragAxis(3, 14)).toBe(LIGHTBOX_DRAG_UPRIGHT);
  // A diagonal drag closes, so paging needs a clearly sideways drag.
  expect(lightboxDragAxis(10, -10)).toBe(LIGHTBOX_DRAG_UPRIGHT);
});

test('the row follows the finger, as far as the photo next to the current one', () => {
  const drag = { current: 2, count: 5, stride: STRIDE, direction: LEFT_TO_RIGHT };
  expect(lightboxDragPosition({ ...drag, translation: -STRIDE / 4 })).toBe(2.25);
  expect(lightboxDragPosition({ ...drag, translation: STRIDE / 2 })).toBe(1.5);
  expect(lightboxDragPosition({ ...drag, translation: -STRIDE * 3 })).toBe(3);
  // In a right-to-left language a drag to the right brings the next photo.
  expect(lightboxDragPosition({ ...drag, direction: RIGHT_TO_LEFT, translation: STRIDE / 4 })).toBe(
    2.25,
  );
});

test('one photo does not move, and the first and last stop at their own edge', () => {
  expect(
    lightboxDragPosition({
      current: 0,
      count: 1,
      stride: STRIDE,
      direction: LEFT_TO_RIGHT,
      translation: -200,
    }),
  ).toBe(0);
  expect(
    lightboxDragPosition({
      current: 0,
      count: 3,
      stride: STRIDE,
      direction: LEFT_TO_RIGHT,
      translation: 200,
    }),
  ).toBe(0);
  expect(
    lightboxDragPosition({
      current: 2,
      count: 3,
      stride: STRIDE,
      direction: LEFT_TO_RIGHT,
      translation: -200,
    }),
  ).toBe(2);
});

test('the photo turns on a long drag or a flick, and settles back on a short slow one', () => {
  const drag = { current: 1, count: 3, stride: STRIDE, direction: LEFT_TO_RIGHT };
  expect(lightboxPageAfterDrag({ ...drag, translation: -STRIDE * 0.6, velocity: 0 })).toBe(2);
  expect(lightboxPageAfterDrag({ ...drag, translation: STRIDE * 0.6, velocity: 0 })).toBe(0);
  expect(lightboxPageAfterDrag({ ...drag, translation: -40, velocity: -900 })).toBe(2);
  expect(lightboxPageAfterDrag({ ...drag, translation: -40, velocity: -100 })).toBe(1);
  // A flick back against the drag keeps the current photo.
  expect(lightboxPageAfterDrag({ ...drag, translation: -40, velocity: 900 })).toBe(1);
  expect(
    lightboxPageAfterDrag({
      ...drag,
      direction: RIGHT_TO_LEFT,
      translation: STRIDE * 0.6,
      velocity: 0,
    }),
  ).toBe(2);
});

test('there is no photo to turn to past the first, the last, or a single photo', () => {
  const far = { translation: -STRIDE, velocity: -900, stride: STRIDE, direction: LEFT_TO_RIGHT };
  expect(lightboxPageAfterDrag({ ...far, current: 0, count: 1 })).toBe(0);
  expect(lightboxPageAfterDrag({ ...far, current: 2, count: 3 })).toBe(2);
  expect(
    lightboxPageAfterDrag({ ...far, translation: STRIDE, velocity: 900, current: 0, count: 3 }),
  ).toBe(0);
});
