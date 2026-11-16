import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test } from 'bun:test';
import type { Database } from '@ramassa/shared';
import { fetchReferralUpdateSubject } from './push-referral-subject';

const UPDATE_ID = '50000000-0000-4000-8000-000000000001';
const REFERRAL_ID = '70000000-0000-4000-8000-000000000001';
const PARTICIPANT_ID = '60000000-0000-4000-8000-000000000001';

type Row = Record<string, unknown> | null;

function fakeClient(rows: Record<string, Row>, error: string | null = null) {
  const reads: string[] = [];
  // Only the chain these reads use: from, select, eq, maybeSingle.
  const fake = {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => {
            reads.push(`${table}.${columns} where ${column}=${value}`);
            return Promise.resolve(
              error === null
                ? { data: rows[table] ?? null, error: null }
                : { data: null, error: { message: error } },
            );
          },
        }),
      }),
    }),
  };
  return { client: fake as unknown as SupabaseClient<Database>, reads };
}

describe('the woman a referral update is about', () => {
  test('is read from the update, then its referral', async () => {
    const { client, reads } = fakeClient({
      referral_updates: { referral_id: REFERRAL_ID },
      entity_referrals: { referred_profile_id: PARTICIPANT_ID },
    });

    expect(await fetchReferralUpdateSubject(client, UPDATE_ID)).toBe(PARTICIPANT_ID);
    expect(reads).toEqual([
      `referral_updates.referral_id where id=${UPDATE_ID}`,
      `entity_referrals.referred_profile_id where id=${REFERRAL_ID}`,
    ]);
  });

  test('is unknown while the referred woman has no account', async () => {
    const { client } = fakeClient({
      referral_updates: { referral_id: REFERRAL_ID },
      entity_referrals: { referred_profile_id: null },
    });

    expect(await fetchReferralUpdateSubject(client, UPDATE_ID)).toBeNull();
  });

  test('is unknown when the reader cannot see the update', async () => {
    const { client, reads } = fakeClient({});

    expect(await fetchReferralUpdateSubject(client, UPDATE_ID)).toBeNull();
    expect(reads).toHaveLength(1);
  });

  test('rejects a failed read with a typed error', async () => {
    const { client } = fakeClient({}, 'permission denied');

    await expect(fetchReferralUpdateSubject(client, UPDATE_ID)).rejects.toMatchObject({
      code: 'DB-1',
    });
  });
});
