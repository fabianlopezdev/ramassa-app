import { expect, test } from 'bun:test';
import { containedPictureCornerOffsets } from './contained-picture-corner';

const frame = { frameWidth: 400, frameAspectRatio: 4 / 3, inset: 8 } as const;

test('a picture of the frame shape fills it, so only the inset is left', () => {
  expect(containedPictureCornerOffsets({ ...frame, pictureAspectRatio: 4 / 3 })).toEqual({
    end: 8,
    bottom: 8,
  });
});

test('a tall picture leaves an even band at each side and none below', () => {
  // 300 high, so a square picture is 300 wide in a 400 wide frame.
  expect(containedPictureCornerOffsets({ ...frame, pictureAspectRatio: 1 })).toEqual({
    end: 58,
    bottom: 8,
  });
});

test('a wide picture leaves an even band above and below and none at the sides', () => {
  // 400 wide at 2:1 is 200 high in a 300 high frame.
  expect(containedPictureCornerOffsets({ ...frame, pictureAspectRatio: 2 })).toEqual({
    end: 8,
    bottom: 58,
  });
});
