import { describe, expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from './intake-builder/field-answers';
import {
  buildReferralPayload,
  createReferralSchema,
  fetchEntityReferrals,
  fetchSupportingEntityNames,
  filterReferrals,
  submitReferralUpdate,
  type Referral,
} from './referrals';
import { systemFieldFixtureId, systemFieldsCatalogFixture, systemOptionFixtureId } from './testing';

const REFERRALS: readonly Referral[] = [
  {
    id: '5eed0000-0000-4000-8010-000000000001',
    entityUserId: '5eed0000-0000-4000-8000-000000000004',
    referredProfileId: null,
    assignedStaffId: null,
    referredFirstName: 'Наталія',
    referredLastName: 'Àlvarez',
    referredPhone: '+34930005499',
    referredEmail: 'nataliia@example.test',
    documentationStatus: 'in_progress',
    notes: null,
    status: 'pending',
    entityName: 'Creu Roja Osona',
    createdAt: '2026-08-14T10:00:00Z',
    updatedAt: '2026-08-14T10:00:00Z',
    answers: null,
    consentConfirmedAt: null,
  },
];

describe('referral intake validation', () => {
  test('normalizes optional contact fields and preserves multilingual names', () => {
    const parsed = createReferralSchema.parse({
      firstName: '  Наталія  ',
      lastName: '  Àlvarez ',
      phone: ' ',
      email: ' NAT@example.test ',
      documentationStatus: 'in_progress',
      notes: ' دعم بالعربية ',
      consentConfirmed: true,
    });

    // Her names and the referral's own data; an empty answer is left out (RAPP-661).
    expect(
      buildReferralPayload(parsed, systemFieldIndexFromCatalog(systemFieldsCatalogFixture())),
    ).toEqual({
      first_name: 'Наталія',
      last_name: 'Àlvarez',
      email: 'nat@example.test',
      documentationStatus: 'in_progress',
      notes: 'دعم بالعربية',
      seasonNumber: null,
      consentConfirmed: true,
      answers: {},
    });
  });

  test('refuses empty names, unsupported states and oversized notes', () => {
    expect(
      createReferralSchema.safeParse({
        firstName: '',
        lastName: 'Test',
        documentationStatus: 'unknown',
        notes: 'x'.repeat(4001),
      }).success,
    ).toBe(false);
  });
});

describe('the season registration questions (RAPP-303)', () => {
  const minimal = {
    firstName: 'Awa',
    lastName: 'Sylla',
    documentationStatus: 'missing' as const,
    consentConfirmed: true as const,
  };

  test('the full form becomes the database payload', () => {
    const parsed = createReferralSchema.parse({
      ...minimal,
      dateOfBirth: '1997-06-12',
      nationality: ' Mali ',
      documentType: 'passport',
      documentNumber: ' ml123456 ',
      city: 'Vic',
      applicantStatus: 'refugee',
      supportingEntities: [' Càritas Vic ', '', 'SOS Racisme'],
      referenceContactName: 'Sílvia Bosch',
      seasonNumber: '3',
      childcareNeed: 'maybe',
      specificNeeds: ' Necessita pauses. ',
    });
    const field = systemFieldFixtureId;
    expect(
      buildReferralPayload(parsed, systemFieldIndexFromCatalog(systemFieldsCatalogFixture()), {
        '5eed0000-0000-4000-8045-000000000001': 'yes',
        '5eed0000-0000-4000-8045-000000000002': null,
      }),
    ).toMatchObject({
      seasonNumber: 3,
      // Every answer by field, the app's and Ramassà's (RAPP-661).
      answers: {
        [field('date_of_birth')]: '1997-06-12',
        [field('nationality')]: 'Mali',
        [field('document_type')]: systemOptionFixtureId('document_type', 'passport'),
        [field('document_number')]: 'ML123456',
        [field('city')]: 'Vic',
        [field('applicant_status')]: systemOptionFixtureId('applicant_status', 'refugee'),
        [field('supporting_entities')]: ['Càritas Vic', 'SOS Racisme'],
        [field('reference_contact_name')]: 'Sílvia Bosch',
        [field('childcare_need')]: 'maybe',
        [field('specific_needs')]: [systemOptionFixtureId('specific_needs', 'other')],
        [field('specific_needs_details')]: 'Necessita pauses.',
        '5eed0000-0000-4000-8045-000000000001': 'yes',
      },
    });
  });

  test('only the names and the consent are required', () => {
    expect(createReferralSchema.safeParse(minimal).success).toBe(true);
    expect(createReferralSchema.safeParse({ ...minimal, consentConfirmed: false }).success).toBe(
      false,
    );
  });

  test('an answer must be one of its choices', () => {
    expect(createReferralSchema.safeParse({ ...minimal, seasonNumber: '6' }).success).toBe(false);
    expect(createReferralSchema.safeParse({ ...minimal, childcareNeed: 'often' }).success).toBe(
      false,
    );
    expect(createReferralSchema.safeParse({ ...minimal, dateOfBirth: '12/06/1997' }).success).toBe(
      false,
    );
  });

  test('a chosen document type that takes a number needs one', () => {
    expect(createReferralSchema.safeParse({ ...minimal, documentType: 'nie' }).success).toBe(false);
    expect(createReferralSchema.safeParse({ ...minimal, documentType: 'none' }).success).toBe(true);
  });
});

describe('referral data access', () => {
  test('parses the decrypted entity list returned by the database RPC', async () => {
    const rpc = async () => ({
      data: [
        {
          id: '5eed0000-0000-4000-8010-000000000001',
          entity_user_id: '5eed0000-0000-4000-8000-000000000004',
          referred_profile_id: null,
          assigned_staff_id: null,
          referred_first_name: 'Наталія',
          referred_last_name: 'Àlvarez',
          referred_phone: null,
          referred_email: 'nat@example.test',
          documentation_status: 'in_progress',
          notes: null,
          status: 'pending',
          entity_name: 'Creu Roja Osona',
          created_at: '2026-08-14T10:00:00Z',
          updated_at: '2026-08-14T10:00:00Z',
        },
      ],
      error: null,
    });

    const rows = await fetchEntityReferrals({ rpc } as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referredFirstName).toBe('Наталія');
    expect(rows[0]?.documentationStatus).toBe('in_progress');
  });

  test('sends only the typed update RPC contract', async () => {
    let args: unknown;
    const rpc = async (_name: string, next: unknown) => {
      args = next;
      return { data: '5eed0000-0000-4000-8020-000000000099', error: null };
    };

    await submitReferralUpdate({ rpc } as never, '5eed0000-0000-4000-8010-000000000001', {
      updateType: 'education',
      content: 'Ha començat català amb أمينة',
    });

    expect(args).toEqual({
      p_referral_id: '5eed0000-0000-4000-8010-000000000001',
      p_update_type: 'education',
      p_content: 'Ha començat català amb أمينة',
    });
  });
});

describe('referral search', () => {
  test('matches half-typed names, folded accents, Arabic or Cyrillic, and an empty result', () => {
    expect(filterReferrals(REFERRALS, 'nat')).toHaveLength(1);
    expect(filterReferrals(REFERRALS, 'alv')).toHaveLength(1);
    expect(filterReferrals(REFERRALS, 'Нат')).toHaveLength(1);
    expect(filterReferrals(REFERRALS, 'creu')).toHaveLength(1);
    expect(filterReferrals(REFERRALS, 'أمينة')).toHaveLength(0);
  });
});

describe('fetchSupportingEntityNames', () => {
  test('reads the partner entity names', async () => {
    const calls: string[] = [];
    const client = {
      rpc: async (name: string) => {
        calls.push(name);
        return { data: ['CEAR Catalunya', 'Creu Roja Osona'], error: null };
      },
    };
    expect(await fetchSupportingEntityNames(client as never)).toEqual([
      'CEAR Catalunya',
      'Creu Roja Osona',
    ]);
    expect(calls).toEqual(['list_supporting_entity_names']);
  });
});
