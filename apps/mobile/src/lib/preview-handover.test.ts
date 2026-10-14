import { expect, test } from 'bun:test';
import { markPreviewHandover, takePreviewHandover } from './preview-handover';

test('a hand-over is taken once by each consumer', () => {
  expect(takePreviewHandover('app-lock')).toBe(false);
  markPreviewHandover();
  expect(takePreviewHandover('app-lock')).toBe(true);
  expect(takePreviewHandover('app-lock')).toBe(false);
  expect(takePreviewHandover('push-rationale')).toBe(true);
  expect(takePreviewHandover('push-rationale')).toBe(false);
});
