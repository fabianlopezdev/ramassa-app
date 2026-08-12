/**
 * Proves simultaneous second and third flags cannot lose the auto-hide transition.
 * Run only after a fresh local reset. The requests use the authenticated RPC path
 * that the player app uses, not a privileged database connection.
 */

import { SEED_ACCOUNT_PASSWORD } from '@ramassa/shared/testing';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const categoryId = '5eed0000-0000-4000-8006-000000000002';

function fail(message: string): never {
  console.error(`Forum flag race check failed: ${message}`);
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

async function rpc(token: string, name: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) fail(`${name} returned ${response.status}: ${text}`);
  return text.length === 0 ? null : JSON.parse(text);
}

const accounts = [
  'amina.alhassan@example.test',
  'fatima.zahra@example.test',
  'zeinab.haddad@example.test',
  'souad.almansouri@example.test',
] as const;
const [authorToken, firstFlaggerToken, secondFlaggerToken, thirdFlaggerToken] = await Promise.all(
  accounts.map(accessToken),
);

const postId = String(
  await rpc(authorToken!, 'create_forum_post', {
    p_category_id: categoryId,
    p_content: 'RAPP-51 simultaneous flag proof',
    p_image_url: null,
  }),
).replaceAll('"', '');

await rpc(firstFlaggerToken!, 'flag_forum_content', {
  p_target_type: 'post',
  p_target_id: postId,
  p_reason: 'harassment',
  p_comment: null,
});

await Promise.all([
  rpc(secondFlaggerToken!, 'flag_forum_content', {
    p_target_type: 'post',
    p_target_id: postId,
    p_reason: 'privacy',
    p_comment: null,
  }),
  rpc(thirdFlaggerToken!, 'flag_forum_content', {
    p_target_type: 'post',
    p_target_id: postId,
    p_reason: 'hate',
    p_comment: null,
  }),
]);

const hiddenResponse = await fetch(
  `${supabaseUrl}/rest/v1/forum_posts?id=eq.${postId}&select=id,visibility,flag_count`,
  { headers: { apikey: publishableKey, authorization: `Bearer ${authorToken}` } },
);
const playerRows = (await hiddenResponse.json()) as unknown[];
if (!hiddenResponse.ok || playerRows.length !== 0) {
  fail(`the three-flag post remained player-visible: ${JSON.stringify(playerRows)}`);
}

const staffToken = await accessToken('marta.puig@example.test');
const staffResponse = await fetch(
  `${supabaseUrl}/rest/v1/forum_posts?id=eq.${postId}&select=id,visibility,flag_count`,
  { headers: { apikey: publishableKey, authorization: `Bearer ${staffToken}` } },
);
const staffRows = (await staffResponse.json()) as Array<{
  visibility?: string;
  flag_count?: number;
}>;
if (
  !staffResponse.ok ||
  staffRows[0]?.visibility !== 'hidden_pending_review' ||
  staffRows[0]?.flag_count !== 3
) {
  fail(`staff evidence was not hidden_pending_review:3: ${JSON.stringify(staffRows)}`);
}

console.log('Forum flag race check passed: simultaneous flags produced hidden_pending_review:3.');

export {};
