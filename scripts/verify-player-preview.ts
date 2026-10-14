/**
 * The preview player account end to end (RAPP-370), against the local stack:
 *
 *   1. Only a team member with a verified second factor starts a preview:
 *      a signed-out caller, a player, and a team member without the second
 *      factor are refused.
 *   2. The address and password it returns open a separate session as the
 *      organization's preview account, and the team member's own session
 *      still works. The password of an earlier start opens nothing.
 *   3. The preview reads exactly what a player reads, and stays out of the
 *      team's participant list.
 *   4. Every write of the preview is refused by the database, even one row
 *      security allows a player.
 *
 * Run with: bun run db:test:player-preview
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../packages/shared/types/database';
import { totpCode } from './qa-web/totp';

const supabaseUrl = 'http://127.0.0.1:54321';
const publishableKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const password = 'ramassa-dev-password';
const seedTotpSecret = 'JBSWY3DPEHPK3PXP';

function newClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function check(condition: boolean, label: string): void {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.info(`ok - ${label}`);
}

async function signIn(email: string): Promise<SupabaseClient<Database>> {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error !== null) throw error;
  return client;
}

async function verifySecondFactor(client: SupabaseClient<Database>): Promise<void> {
  const factors = await client.auth.mfa.listFactors();
  const factor = factors.data?.totp[0];
  if (factor === undefined) throw new Error('The seeded team member has no authenticator');
  const { error } = await client.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: totpCode(seedTotpSecret),
  });
  if (error !== null) throw error;
}

interface PreviewCredentials {
  readonly email: string;
  readonly password: string;
}

async function startPreview(client: SupabaseClient<Database>) {
  const { data, error } = await client.rpc('start_player_preview');
  return { credentials: data as PreviewCredentials | null, code: error?.code ?? null };
}

async function publishedIds(client: SupabaseClient<Database>) {
  const [announcements, events, knowledge, services] = await Promise.all([
    client.from('announcements').select('id').order('id'),
    client.from('events').select('id').order('id'),
    client.from('knowledge_articles').select('id').order('id'),
    client.from('services').select('id').order('id'),
  ]);
  for (const result of [announcements, events, knowledge, services]) {
    if (result.error !== null) throw result.error;
  }
  return JSON.stringify([announcements.data, events.data, knowledge.data, services.data]);
}

// 1. Who may start a preview.
const refusedAnonymous = await startPreview(newClient());
check(refusedAnonymous.credentials === null, 'a signed-out caller is refused');

const player = await signIn('amina.alhassan@example.test');
const refusedPlayer = await startPreview(player);
check(refusedPlayer.code === '42501', 'a player is refused');

const staff = await signIn('marta.puig@example.test');
const refusedAal1 = await startPreview(staff);
check(refusedAal1.code === '42501', 'a team member without her second factor is refused');

await verifySecondFactor(staff);
const earlier = await startPreview(staff);
const started = await startPreview(staff);
check(started.credentials !== null, 'a verified team member gets the preview credentials');

// 2. A separate session as the preview account.
const stale = await newClient().auth.signInWithPassword(earlier.credentials!);
check(stale.error !== null, 'the password of an earlier start opens nothing');
const preview = newClient();
const { data: previewSession, error: previewError } = await preview.auth.signInWithPassword(
  started.credentials!,
);
if (previewError !== null) throw previewError;
const previewId = previewSession.user?.id ?? '';
const { data: previewProfile } = await preview
  .from('profiles')
  .select('role')
  .eq('id', previewId)
  .single();
check(previewProfile?.role === 'preview', 'the password opens the preview account');
const { data: previewRole } = await preview.rpc('current_app_role');
check(previewRole === 'player', 'which the database treats as a player');
const { data: staffCanEdit } = await staff.rpc('has_permission', { p_code: 'announcements.edit' });
check(staffCanEdit === true, "and the team member's own session still works");

// 3. What it reads.
check(
  (await publishedIds(preview)) === (await publishedIds(player)),
  'the preview reads the same announcements, events, articles and services as a player',
);
const { data: participants, error: participantsError } = await staff.rpc('list_participants', {
  p_page_size: 100,
});
if (participantsError !== null) throw participantsError;
check(
  !(participants ?? []).some((row) => row.id === previewId),
  "the preview account is not in the team's participant list",
);

// 4. It writes nothing.
const { data: service } = await preview.from('services').select('id, org_id').limit(1).single();
const { error: interestError } = await preview
  .from('service_interests')
  .insert({ service_id: service!.id, org_id: service!.org_id, user_id: previewId });
check(interestError?.code === '25006', 'a write that row security allows a player is refused');

await preview.auth.signOut({ scope: 'local' });
console.info('player preview: all checks passed');
