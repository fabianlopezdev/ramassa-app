import { describe, expect, test } from 'bun:test';
import { participantFieldAccess, visibleProfileFields } from './participant-profile';

describe('visibleProfileFields', () => {
  test('a coach with the basic level sees only the basic fields', () => {
    expect(visibleProfileFields({ personal: false, sensitive: false })).toEqual([
      'language',
      'entity',
      'clothingSize',
      'shoeSize',
      'mediaConsent',
      'terms',
    ]);
  });

  test('the personal level adds the personal fields and keeps the encrypted ones out', () => {
    const fields = visibleProfileFields({ personal: true, sensitive: false });
    expect(fields).toContain('dateOfBirth');
    expect(fields).toContain('city');
    expect(fields).not.toContain('phone');
    expect(fields).not.toContain('documentNumber');
  });

  test('the sensitive level shows every field', () => {
    expect(visibleProfileFields({ personal: true, sensitive: true })).toHaveLength(17);
  });
});

test('participantFieldAccess reads the two level permissions', () => {
  expect(
    participantFieldAccess(new Set(['participants.view', 'participants.view_sensitive'])),
  ).toEqual({ personal: false, sensitive: true });
});
