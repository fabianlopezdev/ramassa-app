import { expect, test } from 'bun:test';
import {
  GALLERY_MEDIA_FALLBACK_ASPECT_RATIO,
  galleryMediaFrameHeight,
  galleryVideoTitleVisibility,
  mediaAspectRatioOf,
} from './gallery-media-frame';

test('a picture or video gives its own shape once its size is known', () => {
  expect(mediaAspectRatioOf({ width: 1600, height: 1200 })).toBeCloseTo(4 / 3);
  expect(mediaAspectRatioOf({ width: 1080, height: 1920 })).toBeCloseTo(9 / 16);
  expect(mediaAspectRatioOf({ width: 0, height: 1200 })).toBeNull();
  expect(mediaAspectRatioOf({ width: 1600, height: 0 })).toBeNull();
  expect(mediaAspectRatioOf(null)).toBeNull();
  expect(mediaAspectRatioOf(undefined)).toBeNull();
});

test('the frame takes the shape of its picture across the full width', () => {
  expect(
    galleryMediaFrameHeight({ frameWidth: 400, mediaAspectRatio: 4 / 3, maxHeight: 800 }),
  ).toBeCloseTo(300);
  expect(
    galleryMediaFrameHeight({ frameWidth: 400, mediaAspectRatio: 3 / 4, maxHeight: 800 }),
  ).toBeCloseTo(533.33, 1);
  expect(
    galleryMediaFrameHeight({ frameWidth: 400, mediaAspectRatio: 16 / 9, maxHeight: 800 }),
  ).toBeCloseTo(225);
});

test('a very tall picture stops at the height that fits on the screen', () => {
  expect(
    galleryMediaFrameHeight({ frameWidth: 400, mediaAspectRatio: 9 / 16, maxHeight: 600 }),
  ).toBe(600);
  // Without a known screen height the picture keeps its own shape.
  expect(
    galleryMediaFrameHeight({ frameWidth: 400, mediaAspectRatio: 9 / 16, maxHeight: null }),
  ).toBeCloseTo(711.11, 1);
});

test('until the shape is known the frame keeps the old 4:3 shape', () => {
  expect(GALLERY_MEDIA_FALLBACK_ASPECT_RATIO).toBeCloseTo(4 / 3);
  expect(
    galleryMediaFrameHeight({ frameWidth: 400, mediaAspectRatio: null, maxHeight: 800 }),
  ).toBeCloseTo(300);
});

test('the first tap on a video hides its title', () => {
  expect(galleryVideoTitleVisibility(true, { type: 'tap' })).toBe(false);
});

test('the title stays away while the video plays and returns when it is paused', () => {
  expect(
    galleryVideoTitleVisibility(true, {
      type: 'playingChange',
      isPlaying: true,
      status: 'readyToPlay',
    }),
  ).toBe(false);
  expect(
    galleryVideoTitleVisibility(false, {
      type: 'playingChange',
      isPlaying: false,
      status: 'readyToPlay',
    }),
  ).toBe(true);
});

test('a video that stops to load more keeps its title away', () => {
  expect(
    galleryVideoTitleVisibility(false, {
      type: 'playingChange',
      isPlaying: false,
      status: 'loading',
    }),
  ).toBe(false);
  // Before the first tap the title is still there while the video loads.
  expect(
    galleryVideoTitleVisibility(true, {
      type: 'playingChange',
      isPlaying: false,
      status: 'loading',
    }),
  ).toBe(true);
});
