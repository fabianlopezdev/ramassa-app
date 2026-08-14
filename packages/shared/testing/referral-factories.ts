import type { Database } from '../types/database';

type ReferralInsert = Database['public']['Tables']['entity_referrals']['Insert'];
type ReferralUpdateInsert = Database['public']['Tables']['referral_updates']['Insert'];
type SeededReferralInsert = ReferralInsert & { readonly id: string; readonly org_id: string };
type SeededReferralUpdateInsert = ReferralUpdateInsert & {
  readonly id: string;
  readonly org_id: string;
};

const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const ENTITY_ID = '5eed0000-0000-4000-8000-000000000004';
const STAFF_ID = '5eed0000-0000-4000-8000-000000000002';
const PROFILE_ID = '5eed0000-0000-4000-8000-000000000011';
const REFERRAL_ID = '5eed0000-0000-4000-8010-000000000090';
const TIMESTAMP = '2026-08-14T10:00:00+00:00';

export function buildEntityReferral(overrides: Partial<ReferralInsert> = {}): SeededReferralInsert {
  return {
    id: REFERRAL_ID,
    org_id: ORG_ID,
    entity_user_id: ENTITY_ID,
    referred_profile_id: PROFILE_ID,
    assigned_staff_id: STAFF_ID,
    referred_first_name: 'أمينة',
    referred_last_name: 'الحسن',
    referred_phone: '\\x74657374',
    referred_email: '\\x74657374',
    documentation_status: 'complete',
    notes: null,
    status: 'active',
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

export function buildReferralUpdate(
  overrides: Partial<ReferralUpdateInsert> = {},
): SeededReferralUpdateInsert {
  return {
    id: '5eed0000-0000-4000-8020-000000000090',
    org_id: ORG_ID,
    referral_id: REFERRAL_ID,
    author_id: ENTITY_ID,
    update_type: 'education',
    content: '\\x74657374',
    created_at: TIMESTAMP,
    ...overrides,
  };
}
