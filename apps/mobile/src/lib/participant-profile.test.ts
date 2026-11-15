import { describe, expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from '@ramassa/shared/intake-builder';
import { systemFieldsCatalogFixture } from '@ramassa/shared/testing';
import { participantFieldAccess, visibleProfileFields } from './participant-profile';

// Her organization's fields, each at the level the seeded layout gives it.
const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());

describe('visibleProfileFields', () => {
  test('a coach with the basic level sees only the Normal fields and her account', () => {
    expect(visibleProfileFields({ personal: false, sensitive: false }, fields)).toEqual([
      'language',
      'entity',
      'clothingSize',
      'shoeSize',
      'seasonNumber',
      'mediaConsent',
      'terms',
    ]);
  });

  test('the personal level adds the personal fields and keeps the encrypted ones out', () => {
    const shown = visibleProfileFields({ personal: true, sensitive: false }, fields);
    expect(shown).toContain('dateOfBirth');
    expect(shown).toContain('city');
    expect(shown).not.toContain('phone');
    expect(shown).not.toContain('documentNumber');
    // The season answers (RAPP-303): childcare is personal, the needs are sensitive.
    expect(shown).toContain('childcareNeed');
    expect(shown).not.toContain('applicantStatus');
    expect(shown).not.toContain('specificNeeds');
  });

  test('the sensitive level shows every field', () => {
    expect(visibleProfileFields({ personal: true, sensitive: true }, fields)).toHaveLength(22);
  });

  test('the level is the layout’s: a field staff make Normal shows to a coach', () => {
    const changed = systemFieldIndexFromCatalog({
      fields: systemFieldsCatalogFixture().fields.map((field) =>
        (field as { system_key: string }).system_key === 'phone'
          ? { ...(field as object), privacy: 'normal' }
          : field,
      ),
    });
    expect(visibleProfileFields({ personal: false, sensitive: false }, changed)).toContain('phone');
  });

  test('a field the layout no longer has shows no row', () => {
    const without = new Map([...fields].filter(([key]) => key !== 'city'));
    expect(visibleProfileFields({ personal: true, sensitive: true }, without)).not.toContain(
      'city',
    );
  });
});

test('participantFieldAccess reads the two level permissions', () => {
  expect(
    participantFieldAccess(new Set(['participants.view', 'participants.view_sensitive'])),
  ).toEqual({ personal: false, sensitive: true });
});
