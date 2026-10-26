import { describe, expect, test } from 'bun:test';
import {
  consentDecisionsPayload,
  consentsOn,
  consentText,
  parseConsentPlacements,
  parseConsents,
  surfacesOfConsent,
  untickedRequiredConsents,
} from './consents';

const IMAGE = '00000000-0000-4000-8000-000000000001';
const TRIPS = '00000000-0000-4000-8000-000000000002';
const SCREEN = '00000000-0000-4000-8000-0000000000aa';

const consents = parseConsents([
  {
    id: IMAGE,
    key: 'image_rights',
    system_key: 'image_rights',
    name: { ca: "Drets d'imatge" },
    body: { ca: 'Autoritzo les fotos.', ar: 'أوافق على الصور.' },
    is_archived: false,
  },
  {
    id: TRIPS,
    key: 'sortides',
    system_key: null,
    name: { ca: 'Sortides' },
    body: { ca: 'Vinc a les sortides.' },
    is_archived: false,
  },
  { id: 'not-a-uuid', key: 'broken' },
]);
const consentPlacements = parseConsentPlacements([
  {
    id: '00000000-0000-4000-8000-0000000000b1',
    consent_id: TRIPS,
    surface: 'authorization',
    screen_key: null,
    sort_order: 1,
    required: true,
  },
  {
    id: '00000000-0000-4000-8000-0000000000b2',
    consent_id: IMAGE,
    surface: 'authorization',
    screen_key: null,
    sort_order: 0,
    required: false,
  },
  {
    id: '00000000-0000-4000-8000-0000000000b3',
    consent_id: TRIPS,
    surface: 'onboarding',
    screen_key: SCREEN,
    sort_order: 4,
    required: false,
  },
]);

describe('consents of Dades legals (RAPP-699)', () => {
  test('a row this build cannot read is left out', () => {
    expect(consents.map((consent) => consent.key)).toEqual(['image_rights', 'sortides']);
    expect(consents[0]?.systemKey).toBe('image_rights');
  });

  test('a screen asks its consents in its order, with their flags', () => {
    const asked = consentsOn({ consents, consentPlacements }, 'authorization', null);
    expect(asked.map((consent) => `${consent.key}:${consent.required}`)).toEqual([
      'image_rights:false',
      'sortides:true',
    ]);
    expect(consentsOn({ consents, consentPlacements }, 'onboarding', SCREEN)).toHaveLength(1);
  });

  test('an archived consent is asked nowhere', () => {
    const archived = consents.map((consent) => ({ ...consent, isArchived: true }));
    expect(consentsOn({ consents: archived, consentPlacements }, 'authorization', null)).toEqual(
      [],
    );
  });

  test('where a consent is asked', () => {
    expect(surfacesOfConsent(consentPlacements, TRIPS)).toEqual(['authorization', 'onboarding']);
    expect(surfacesOfConsent(consentPlacements, IMAGE)).toEqual(['authorization']);
  });

  test('its text in her language, or Catalan', () => {
    expect(consentText(consents[0]!.body, 'ar')).toEqual({
      text: 'أوافق على الصور.',
      language: 'ar',
    });
    expect(consentText(consents[1]!.body, 'fa')).toEqual({
      text: 'Vinc a les sortides.',
      language: 'ca',
    });
  });

  test('the form sends every consent asked, and waits for the required ones', () => {
    const asked = consentsOn({ consents, consentPlacements }, 'authorization', null);
    expect(consentDecisionsPayload(asked, { sortides: true })).toEqual({
      image_rights: false,
      sortides: true,
    });
    expect(untickedRequiredConsents(asked, {})).toEqual(['sortides']);
    expect(untickedRequiredConsents(asked, { sortides: true })).toEqual([]);
  });
});
