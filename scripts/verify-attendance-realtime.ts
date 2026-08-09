/**
 * Live two-client proof for RAPP-38. Run against a reset local Supabase stack.
 * It verifies propagation in both directions and the database's marked_at LWW rule.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@ramassa/shared';
import { upsertAttendanceMark, type AttendanceMark } from '@ramassa/shared/attendance';

const url = 'http://127.0.0.1:54321';
const key = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const password = 'ramassa-dev-password';
const playerId = '5eed0000-0000-4000-8000-000000000013';
const todayEventId = '5eed0000-0000-4000-8003-000000000005';

function client(): SupabaseClient<Database> {
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

async function signIn(instance: SupabaseClient<Database>, email: string): Promise<void> {
  const { error } = await instance.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function observeNext(
  instance: SupabaseClient<Database>,
  occurrenceId: string,
  action: () => Promise<AttendanceMark>,
): Promise<{ readonly written: AttendanceMark; readonly observed: AttendanceMark }> {
  const channel = instance.channel(`rapp-38-proof:${crypto.randomUUID()}`);
  let resolveObserved!: (mark: AttendanceMark) => void;
  let rejectObserved!: (error: Error) => void;
  const observed = new Promise<AttendanceMark>((resolve, reject) => {
    resolveObserved = resolve;
    rejectObserved = reject;
  });
  let resolveSubscribed!: () => void;
  let rejectSubscribed!: (error: Error) => void;
  const subscribed = new Promise<void>((resolve, reject) => {
    resolveSubscribed = resolve;
    rejectSubscribed = reject;
  });
  const timeout = setTimeout(() => {
    const error = new Error('Timed out waiting for attendance realtime');
    rejectSubscribed(error);
    rejectObserved(error);
  }, 30_000);
  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'attendance',
        filter: `occurrence_id=eq.${occurrenceId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') return;
        const mark = payload.new as AttendanceMark;
        if (mark.player_id !== playerId) return;
        clearTimeout(timeout);
        resolveObserved(mark);
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') resolveSubscribed();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        const error = new Error(`Realtime channel failed: ${status}`);
        rejectSubscribed(error);
        rejectObserved(error);
      }
    });
  try {
    await subscribed;
    const written = await action();
    const received = await observed;
    return { written, observed: received };
  } finally {
    clearTimeout(timeout);
    await instance.removeChannel(channel);
  }
}

const coach = client();
const admin = client();
await Promise.all([
  signIn(coach, 'marta.puig@example.test'),
  signIn(admin, 'laia.ferrer@example.test'),
]);

const { data: occurrence, error: occurrenceError } = await coach
  .from('event_occurrences')
  .select('id')
  .eq('event_id', todayEventId)
  .single();
if (occurrenceError) throw occurrenceError;

const firstTimestamp = new Date().toISOString();
const coachToAdmin = await observeNext(admin, occurrence.id, () =>
  upsertAttendanceMark(coach, {
    occurrenceId: occurrence.id,
    playerId,
    status: 'present',
    markedAt: firstTimestamp,
  }),
);
if (Date.parse(coachToAdmin.observed.marked_at) !== Date.parse(firstTimestamp)) {
  throw new Error('Admin did not observe the coach timestamp');
}

const secondTimestamp = new Date(Date.parse(firstTimestamp) + 1_000).toISOString();
const adminToCoach = await observeNext(coach, occurrence.id, () =>
  upsertAttendanceMark(admin, {
    occurrenceId: occurrence.id,
    playerId,
    status: 'excused',
    markedAt: secondTimestamp,
  }),
);
if (adminToCoach.observed.status !== 'excused')
  throw new Error('Coach did not observe admin update');

const stale = await upsertAttendanceMark(coach, {
  occurrenceId: occurrence.id,
  playerId,
  status: 'absent',
  markedAt: firstTimestamp,
});
if (stale.status !== 'excused' || Date.parse(stale.marked_at) !== Date.parse(secondTimestamp)) {
  throw new Error('An older offline write incorrectly replaced the newer mark');
}

await Promise.all([coach.auth.signOut(), admin.auth.signOut()]);
console.log(
  JSON.stringify({
    occurrenceId: occurrence.id,
    coachToAdmin: coachToAdmin.observed.status,
    adminToCoach: adminToCoach.observed.status,
    staleWriteResolvedTo: stale.status,
    conflictClock: stale.marked_at,
  }),
);

// Bun keeps the websocket transport's native handle alive briefly even after
// both channels and sessions are closed. This is a one-shot verification
// command, so terminate explicitly once cleanup and the evidence line finish.
process.exit(0);
