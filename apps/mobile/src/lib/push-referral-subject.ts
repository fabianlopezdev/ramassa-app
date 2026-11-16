/**
 * The woman a referral update push is about (X4). The push carries only the
 * update's id, so her card needs two reads the referral's team member may make
 * (`referrals.manage` reads both tables): the update's referral, then the
 * referral's account. A referral whose woman has no account yet names nobody.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@ramassa/shared';
import { AppError } from '@ramassa/shared/errors';

export async function fetchReferralUpdateSubject(
  client: SupabaseClient<Database>,
  referralUpdateId: string,
): Promise<string | null> {
  const update = await client
    .from('referral_updates')
    .select('referral_id')
    .eq('id', referralUpdateId)
    .maybeSingle();
  if (update.error !== null) throw new AppError('DB-1', { message: update.error.message });
  if (update.data === null) return null;

  const referral = await client
    .from('entity_referrals')
    .select('referred_profile_id')
    .eq('id', update.data.referral_id)
    .maybeSingle();
  if (referral.error !== null) throw new AppError('DB-1', { message: referral.error.message });
  return referral.data?.referred_profile_id ?? null;
}
