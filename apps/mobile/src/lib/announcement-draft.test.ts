import { describe, expect, test } from 'bun:test';
import {
  clearAnnouncementDraft,
  readAnnouncementDraft,
  writeAnnouncementDraft,
  type AnnouncementDraft,
} from './announcement-draft';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => void values.set(key, value),
    remove: (key: string) => values.delete(key),
  };
}

const draft: AnnouncementDraft = {
  category: 'training',
  title: 'Canvi d’horari',
  body: 'Dijous a les 18:00',
  imageAlt: '',
  imageUrl: null,
  isPinned: false,
  mode: 'draft',
  publishedAt: null,
  expiresAt: null,
};

describe('the announcement draft on the device', () => {
  test('is kept per person and per announcement, and removed after the save', () => {
    const storage = memoryStorage();
    writeAnnouncementDraft(storage, 'u1', 'new', draft);
    expect(readAnnouncementDraft(storage, 'u1', 'new')).toEqual(draft);
    expect(readAnnouncementDraft(storage, 'u2', 'new')).toBeNull();
    expect(readAnnouncementDraft(storage, 'u1', 'a1')).toBeNull();
    clearAnnouncementDraft(storage, 'u1', 'new');
    expect(readAnnouncementDraft(storage, 'u1', 'new')).toBeNull();
  });

  test('a broken or old draft is ignored', () => {
    const storage = memoryStorage();
    storage.set('content.announcement-draft.u1.new', '{not json');
    expect(readAnnouncementDraft(storage, 'u1', 'new')).toBeNull();
    storage.set('content.announcement-draft.u1.new', JSON.stringify({ ...draft, mode: 'later' }));
    expect(readAnnouncementDraft(storage, 'u1', 'new')).toBeNull();
  });
});
