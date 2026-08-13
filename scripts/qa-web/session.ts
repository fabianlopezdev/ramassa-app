/**
 * What every web QA spec needs before it can assert anything: a real sign-in,
 * and a way to ask the DATABASE what the answer should be.
 *
 * Deliberately NOT a `*.web-qa.ts` file, so Playwright treats it as a module
 * rather than as a spec with no tests in it.
 *
 * It exists because the second spec would otherwise have copied the first one's
 * login helper, and a copied login helper is how one suite quietly keeps
 * passing against an auth flow the other one has already noticed is broken.
 */

import { execFileSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';

export const STAFF_EMAIL = 'marta.puig@example.test';
export const ENTITY_EMAIL = 'silvia.bosch@example.test';
export const SEED_PASSWORD = 'ramassa-dev-password';

/**
 * The local stack, for the one spec that has to talk to something other than the
 * admin app: erasing a participant removes objects from R2, and proving that
 * needs a real object put there through the real upload path (RAPP-26).
 *
 * Local defaults, matching apps/admin/.env. They are not secrets: the
 * publishable key is in the client bundle by design.
 */
export const SUPABASE_URL = 'http://127.0.0.1:54321';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
export const MEDIA_WORKER_URL = `http://127.0.0.1:${process.env.RAMASSA_QA_MEDIA_PORT ?? '8893'}`;

/** An access token for an arbitrary account, the way GoTrue issues one. */
export async function accessTokenFor(email: string, password: string): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Could not sign in as ${email}: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token?: string };
  if (body.access_token === undefined) {
    throw new Error(`No access token for ${email}`);
  }
  return body.access_token;
}

/**
 * Uploads one object AS the given identity, through the product's own path:
 * the Worker mints a key and a signed URL, and the bytes go where it says.
 *
 * Deliberately not written straight into the bucket. The object key is what the
 * erasure sweep matches on, and a key this test invented would prove the sweep
 * works against test data rather than against what the app actually stores.
 */
export async function uploadObjectAs(
  accessToken: string,
  bytes: Uint8Array,
  folder = 'profile-photos',
): Promise<{ readonly objectKey: string }> {
  const minted = await fetch(`${MEDIA_WORKER_URL}/uploads/url`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      folder,
      contentType: 'image/jpeg',
      contentLength: bytes.byteLength,
    }),
  });
  if (!minted.ok) {
    throw new Error(`Mint refused: ${minted.status} ${await minted.text()}`);
  }
  const target = (await minted.json()) as {
    uploadUrl: string;
    objectKey: string;
    requiredHeaders: Record<string, string>;
  };

  const stored = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: target.requiredHeaders,
    // The DOM lib is not in this project's tsconfig (it is a bun/node context),
    // so the fetch body type is not nameable here; the value is a plain
    // Uint8Array, which every runtime accepts.
    body: bytes,
  });
  if (!stored.ok) {
    throw new Error(`Storage refused the upload: ${stored.status} ${await stored.text()}`);
  }
  return { objectKey: target.objectKey };
}

/**
 * One scalar, straight from the local database through psql in the Supabase
 * container, rather than through the app's own client.
 *
 * Asking the app what it expects to show would be circular: the bugs this suite
 * exists to catch are exactly the ones where the app is confidently wrong. psql
 * connects as the owner, so it sees past RLS and past the app's own query
 * layer, which is what makes it an independent answer rather than a second
 * opinion from the same source.
 */
export function queryDatabase(sql: string): string {
  const container = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split('\n')
    .find((name) => name === 'supabase_db_ramassa');
  if (container === undefined) {
    throw new Error('The Ramassà local Supabase database is not running: bunx supabase start');
  }
  return execFileSync(
    'docker',
    ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

export function countInDatabase(sql: string): number {
  return Number(queryDatabase(sql));
}

/**
 * One scalar, read as a given signed-in ADDRESS rather than as the owner.
 *
 * Some promises are only true from inside a session: `my_pending_invite()`
 * keys on the JWT's email precisely so there is no argument that could widen
 * it, which means the owner-level `queryDatabase` cannot see what it returns
 * for a particular woman. This sets the claims the way GoTrue presents them.
 *
 * `set local` needs a transaction, and psql echoes a command tag for every
 * statement in the batch ("BEGIN", "SET", ...), so only the LAST line is the
 * answer. An empty answer (no row) stays an empty string.
 */
export function queryDatabaseAsAddress(email: string, sql: string): string {
  const claims = JSON.stringify({
    sub: '5eed0000-0000-4000-8000-000000000026',
    role: 'authenticated',
    email,
  });
  const output = queryDatabase(
    `begin;
     set local role authenticated;
     set local request.jwt.claims = '${claims}';
     ${sql}
     commit;`,
  );
  const lines = output.split('\n').filter((line) => !/^(BEGIN|SET|COMMIT|ROLLBACK)$/.test(line));
  return (lines.at(-1) ?? '').trim();
}

/**
 * Signs in the way a person does: the password path, because local mail is not
 * wired up.
 *
 * The toggle is clicked with a RETRY, which is not paranoia. The admin is
 * server-rendered, so on a cold load the button exists in the markup before
 * React has attached its handler, and a click in that window does nothing at
 * all. A person never notices; an automated run hits it every time and reads
 * as "the login page is broken".
 */
/**
 * Signs the current identity out THROUGH THE PRODUCT, so a spec can sign in as
 * somebody else afterwards.
 *
 * It is needed because `/login` on an authenticated session redirects to that
 * role's landing, so a second `signIn` in one test would silently never see a
 * login form. Both landings carry the button: the staff dashboard, and the
 * terminal "no admin access" screen a participant lands on.
 */
export async function signOut(page: Page): Promise<void> {
  await page.goto('/dashboard');

  const signOutButton = page
    .getByRole('button', { name: /tanca la sessió|sign out|log out|cerrar sesión/i })
    .first();
  const loginEmailField = page.locator('input[type="email"]');

  // WAITED FOR, never counted straight away. `count()` does not auto-wait, so
  // asking on a cold server-rendered load answers "no button" while React is
  // still hydrating; this helper then returned without signing anyone out and
  // the caller failed much later, looking like a broken login page.
  await expect(signOutButton.or(loginEmailField).first()).toBeVisible({ timeout: 20_000 });

  // Already signed out: the guard sent an unauthenticated visitor to /login.
  if ((await signOutButton.count()) === 0) return;

  // The same hydration retry the sign-in below needs, for the same reason.
  await expect(async () => {
    await signOutButton.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

export async function signIn(page: Page, email: string): Promise<void> {
  // Signing out first makes this safe to call twice in one test. `/login` on
  // an authenticated session redirects to that role's landing, so a second
  // call would otherwise wait 20s for a form that is never coming and fail as
  // "the login page is broken" — a full page away from the real cause.
  await signOut(page);

  await page.goto('/login');
  const usePassword = page.getByRole('button', { name: /contrasenya|password/i }).first();
  await expect(usePassword).toBeVisible();

  await expect(async () => {
    await usePassword.click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(SEED_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
}
