import { expect, test } from 'bun:test';
import { formatGalleryDate } from './gallery-date';

test('the day it was shared is written in her language', () => {
  expect(formatGalleryDate('2026-11-23T10:00:00Z', 'en')).toBe('Nov 23, 2026');
  expect(formatGalleryDate('2026-11-23T10:00:00Z', 'ca')).toContain('2026');
  expect(formatGalleryDate('2026-11-23T10:00:00Z', 'ca')).not.toBe(
    formatGalleryDate('2026-11-23T10:00:00Z', 'en'),
  );
});

test('the day follows the club calendar in Barcelona', () => {
  // 23:30 in London on 23 November is already 24 November in Barcelona.
  expect(formatGalleryDate('2026-11-23T23:30:00Z', 'en')).toBe('Nov 24, 2026');
});
