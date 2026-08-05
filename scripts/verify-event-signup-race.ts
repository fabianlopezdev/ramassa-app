/**
 * Proves the last-place invariant through the same authenticated REST path the
 * player app uses. Run after `bun run db:reset` with the local stack running.
 */

import { SEED_ACCOUNT_PASSWORD } from '@ramassa/shared/testing';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const fullEventId = '5eed0000-0000-4000-8003-000000000004';

function fail(message: string): never {
  console.error(`Event signup race check failed: ${message}`);
  process.exit(1);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl)) {
  fail('the check only runs against the local Supabase stack');
}
if (publishableKey.length === 0) fail('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing');

async function accessToken(email: string): Promise<string> {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: SEED_ACCOUNT_PASSWORD }),
  });
  const body = (await response.json()) as { access_token?: string; message?: string };
  if (!response.ok || body.access_token === undefined) {
    fail(`could not authenticate ${email}: ${body.message ?? response.status}`);
  }
  return body.access_token;
}

interface SignupAttempt {
  readonly ok: boolean;
  readonly status: number;
  readonly body: string;
}

async function setSignup(
  token: string,
  playerId: string,
  state: 'confirmed' | 'cancelled',
): Promise<SignupAttempt> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/event_signups?on_conflict=event_id%2Cplayer_id&select=id%2Cstate`,
    {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({ event_id: fullEventId, player_id: playerId, state }),
    },
  );
  return { ok: response.ok, status: response.status, body: await response.text() };
}

const players = [
  {
    id: '5eed0000-0000-4000-8000-000000000011',
    email: 'amina.alhassan@example.test',
  },
  {
    id: '5eed0000-0000-4000-8000-000000000012',
    email: 'fatima.zahra@example.test',
  },
] as const;
const seededHolder = {
  id: '5eed0000-0000-4000-8000-000000000013',
  email: 'mariam.benali@example.test',
} as const;

const [holderToken, ...contenderTokens] = await Promise.all([
  accessToken(seededHolder.email),
  ...players.map((player) => accessToken(player.email)),
]);
const released = await setSignup(holderToken, seededHolder.id, 'cancelled');
if (!released.ok) fail(`could not release the seeded place (${released.status})`);

let winnerIndex = -1;
try {
  const attempts = await Promise.all(
    players.map((player, index) => setSignup(contenderTokens[index]!, player.id, 'confirmed')),
  );
  const successful = attempts.flatMap((attempt, index) => (attempt.ok ? [index] : []));
  const capacityFailures = attempts.filter(
    (attempt) => !attempt.ok && attempt.body.includes('EVENTS/CAPACITY_FULL'),
  );
  if (successful.length !== 1 || capacityFailures.length !== 1) {
    fail(
      `expected one success and one EVENTS/CAPACITY_FULL response, got statuses ${attempts
        .map((attempt) => `${attempt.status}:${attempt.body}`)
        .join(', ')}`,
    );
  }
  winnerIndex = successful[0]!;

  const eventResponse = await fetch(
    `${supabaseUrl}/rest/v1/events?id=eq.${fullEventId}&select=active_signup_count`,
    {
      headers: { apikey: publishableKey, authorization: `Bearer ${contenderTokens[winnerIndex]}` },
    },
  );
  const events = (await eventResponse.json()) as { active_signup_count?: number }[];
  if (!eventResponse.ok || events[0]?.active_signup_count !== 1) {
    fail('the event count was not exactly one after the race');
  }
  console.log('Event signup race check passed: one player claimed the last place.');
} finally {
  if (winnerIndex >= 0) {
    const winnerReleased = await setSignup(
      contenderTokens[winnerIndex]!,
      players[winnerIndex]!.id,
      'cancelled',
    );
    if (!winnerReleased.ok) {
      fail(`could not release the race winner (${winnerReleased.status}: ${winnerReleased.body})`);
    }
  }
  let holderRestored = await setSignup(holderToken, seededHolder.id, 'confirmed');
  for (
    let attempt = 0;
    !holderRestored.ok && holderRestored.body.includes('EVENTS/CAPACITY_FULL') && attempt < 5;
    attempt += 1
  ) {
    // PostgREST can finish streaming the cancellation response just before its
    // commit becomes visible to the next HTTP transaction.
    await Bun.sleep(100);
    holderRestored = await setSignup(holderToken, seededHolder.id, 'confirmed');
  }
  if (!holderRestored.ok) {
    fail(`could not restore the seeded holder (${holderRestored.status}: ${holderRestored.body})`);
  }
}

export {};
