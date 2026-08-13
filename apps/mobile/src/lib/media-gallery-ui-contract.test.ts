import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

const gallery = readFileSync(new URL('../app/(app)/gallery/index.tsx', import.meta.url), 'utf8');
const upload = readFileSync(new URL('../app/(app)/gallery/upload.tsx', import.meta.url), 'utf8');
const item = readFileSync(new URL('../app/(app)/gallery/[id].tsx', import.meta.url), 'utf8');

test('gallery uses FlashList with recycled lazy thumbnails', () => {
  expect(gallery).toContain('FlashList');
  expect(gallery).toContain('recyclingKey');
  expect(gallery).toContain('cachePolicy="memory-disk"');
});

test('upload requires consent and exposes determinate progress plus retry', () => {
  expect(upload).toContain('gallery-consent-acknowledgment');
  expect(upload).toContain('gallery-upload-progress');
  expect(upload).toContain('gallery-upload-retry');
  expect(upload).toContain("t('gallery:consentReminder')");
});

test('item view exposes privacy editing, deletion, flagging, and video playback', () => {
  expect(item).toContain('VideoView');
  expect(item).toContain('gallery-privacy-picker');
  expect(item).toContain('gallery-delete');
  expect(item).toContain('gallery-flag');
});
