import { describe, expect, test } from 'bun:test';
import {
  photoHandoffAppLink,
  photoHandoffPath,
  photoHandoffState,
  type PhotoHandoff,
} from './photo-handoff';

const handoff: PhotoHandoff = {
  id: 'h-1',
  target: 'internal_document',
  documentName: 'Receipt',
  expiresAt: '2026-10-13T10:10:00.000Z',
  completedAt: null,
  resultId: null,
};

describe('photoHandoffState', () => {
  test('open until it expires, done once completed', () => {
    expect(photoHandoffState(handoff, new Date('2026-10-13T10:05:00Z'))).toBe('open');
    expect(photoHandoffState(handoff, new Date('2026-10-13T10:10:00Z'))).toBe('expired');
    expect(
      photoHandoffState(
        { ...handoff, completedAt: '2026-10-13T10:06:00Z' },
        new Date('2026-10-13T10:20:00Z'),
      ),
    ).toBe('done');
  });
});

describe('links', () => {
  test('the QR opens the web page; the page offers the app', () => {
    expect(photoHandoffPath('h-1')).toBe('/photo-handoff/h-1');
    expect(photoHandoffAppLink('h-1')).toBe('ramassa://photo-handoff/h-1');
  });
});
