import { describe, expect, test } from 'bun:test';
import {
  buildReferralPayload,
  createReferralSchema,
  fetchEntityReferrals,
  filterReferrals,
  submitReferralUpdate,
  type Referral,
} from './referrals';

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
    });

    expect(buildReferralPayload(parsed)).toEqual({
      firstName: 'Наталія',
      lastName: 'Àlvarez',
      phone: null,
      email: 'nat@example.test',
      documentationStatus: 'in_progress',
      notes: 'دعم بالعربية',
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
