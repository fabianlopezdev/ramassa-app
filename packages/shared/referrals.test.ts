import { describe, expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from './intake-builder/field-answers';
import {
  createReferralSchema,
  createReferralSchemaFor,
  fetchEntityReferrals,
  fetchReferralRecord,
  fetchSupportingEntityNames,
  filterReferrals,
  referralAppAnswers,
  referralRequest,
  sendReferral,
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
      referralRequest(
        parsed,
        referralAppAnswers(systemFieldIndexFromCatalog(systemFieldsCatalogFixture()), parsed),
      ),
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

describe('the referral form reads the options of her organization (RAPP-665)', () => {
  const minimal = {
    firstName: 'Awa',
    lastName: 'Sylla',
    documentationStatus: 'missing' as const,
    consentConfirmed: true as const,
  };
  const raw = systemFieldsCatalogFixture();
  const withArchivedNone = {
    fields: raw.fields.map((field) => {
      const row = field as { system_key: string; options: { key: string; is_archived: boolean }[] };
      return row.system_key !== 'document_type'
        ? row
        : {
            ...row,
            options: row.options.map((option) => ({
              ...option,
              is_archived: option.key === 'none',
            })),
          };
    }),
  };

  test('a live option of the field is accepted', () => {
    const fields = systemFieldIndexFromCatalog(raw);
    expect(
      createReferralSchemaFor(fields).safeParse({ ...minimal, documentType: 'none' }).success,
    ).toBe(true);
  });

  test('an option staff archived on the field is refused', () => {
    const fields = systemFieldIndexFromCatalog(withArchivedNone);
    const parsed = createReferralSchemaFor(fields).safeParse({ ...minimal, documentType: 'none' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['documentType']);
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

describe('the referral by field (RAPP-663)', () => {
  const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());
  const referral = createReferralSchema.parse({
    firstName: 'Amina',
    lastName: 'Haddad',
    phone: '612 345 678',
    documentationStatus: 'missing',
    documentType: 'none',
    documentNumber: 'X1',
    city: 'Vic',
    applicantStatus: 'refugee',
    supportingEntities: [],
    specificNeeds: 'Una cadira de rodes',
    seasonNumber: 2,
    consentConfirmed: true,
  });

  test('her answers by field: a local phone gets +34, no number without a document', () => {
    expect(referralAppAnswers(fields, referral)).toEqual({
      [systemFieldFixtureId('phone')]: '+34612345678',
      [systemFieldFixtureId('document_type')]: systemOptionFixtureId('document_type', 'none'),
      [systemFieldFixtureId('city')]: 'Vic',
      [systemFieldFixtureId('applicant_status')]: systemOptionFixtureId(
        'applicant_status',
        'refugee',
      ),
      // Her own words read as another circumstance, in the one details text.
      [systemFieldFixtureId('specific_needs')]: [systemOptionFixtureId('specific_needs', 'other')],
      [systemFieldFixtureId('specific_needs_details')]: 'Una cadira de rodes',
    });
  });

  test('the request carries her names, her answers by field and the referral itself', async () => {
    let call: unknown;
    const rpc = async (name: string, args: unknown) => {
      call = [name, args];
      return { data: '5eed0000-0000-4000-8010-000000000009', error: null };
    };
    await sendReferral({ rpc } as never, referral, {
      [systemFieldFixtureId('city')]: 'Vic',
      team: '',
    });
    expect(call).toEqual([
      'create_entity_referral',
      {
        p_payload: {
          first_name: 'Amina',
          last_name: 'Haddad',
          email: null,
          documentationStatus: 'missing',
          notes: null,
          seasonNumber: 2,
          consentConfirmed: true,
          answers: { [systemFieldFixtureId('city')]: 'Vic' },
        },
      },
    ]);
  });

  test('one referral reads with its answers by field and the fields to read them by', async () => {
    const rpc = async (name: string) =>
      name === 'intake_catalog'
        ? { data: systemFieldsCatalogFixture(), error: null }
        : {
            data: [
              {
                id: '5eed0000-0000-4000-8010-000000000001',
                entity_user_id: '5eed0000-0000-4000-8000-000000000004',
                referred_profile_id: null,
                assigned_staff_id: null,
                referred_first_name: 'Amina',
                referred_last_name: 'Haddad',
                referred_phone: null,
                referred_email: null,
                documentation_status: 'missing',
                notes: null,
                status: 'pending',
                entity_name: 'Creu Roja Osona',
                created_at: '2026-08-14T10:00:00Z',
                updated_at: '2026-08-14T10:00:00Z',
                answers: { [systemFieldFixtureId('phone')]: '+34612345678' },
                season_number: 2,
                consent_confirmed_at: null,
              },
            ],
            error: null,
          };
    const record = await fetchReferralRecord(
      { rpc } as never,
      '5eed0000-0000-4000-8010-000000000001',
    );
    expect(record.answers).toEqual({ [systemFieldFixtureId('phone')]: '+34612345678' });
    expect(record.seasonNumber).toBe(2);
    expect(record.fields.get('phone')?.id).toBe(systemFieldFixtureId('phone'));
  });
});
