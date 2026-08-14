import { expect, test } from 'bun:test';
import { buildEntityReferral, buildReferralUpdate } from './referral-factories';

test('referral factories preserve tenant linkage and allow focused overrides', () => {
  const referral = buildEntityReferral({ status: 'inactive' });
  const update = buildReferralUpdate({ referral_id: referral.id });

  expect(referral.org_id).toBe(update.org_id);
  expect(referral.status).toBe('inactive');
  expect(update.referral_id).toBe(referral.id);
});
