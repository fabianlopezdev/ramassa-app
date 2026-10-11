import { describe, expect, test } from 'bun:test';
import { PERSISTED_QUERY_ROOTS } from './query-persistence';

/**
 * Decrypted personal data never reaches the disk (RAPP-237). The persisted
 * cache is an allow-list; this test holds it to organization content, so adding
 * a root is a deliberate, reviewed change.
 */
describe('persisted query cache', () => {
  test('only organization content shown to players is saved to disk', () => {
    expect([...PERSISTED_QUERY_ROOTS].sort()).toEqual(
      [
        'player-announcements',
        'player-events',
        'player-forum',
        'player-gallery',
        'player-knowledge',
        'player-services',
      ].sort(),
    );
  });

  test('no root that carries personal data is on the list', () => {
    for (const root of [
      'own-profile',
      'messaging',
      'participants',
      'attendance',
      'staff-messaging',
    ]) {
      expect(PERSISTED_QUERY_ROOTS.includes(root)).toBe(false);
    }
  });
});
