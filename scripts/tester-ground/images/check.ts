/**
 * Tester ground (RAPP-885): proves that a tester's app gets each stock image.
 *
 * It signs in as a tester (a one-time sign-in link made with the secret key,
 * so no password is needed), builds each image URL with the app's own
 * `buildMediaObjectUrl`, sends her token the way `resolveMediaImageSource`
 * does, and compares the bytes with the cached file. For every image it also
 * says which row points at the key, because the media worker serves a gallery
 * photo or a profile photo only when the database ties the key to a row she
 * may see.
 *
 *   bun scripts/tester-ground/images/check.ts                 every image, as prova1@example.test
 *   bun scripts/tester-ground/images/check.ts gallery avatar  only these prefixes
 *   bun scripts/tester-ground/images/check.ts --email prova3@example.test
 *
 * Defaults point at the shared local stack and the local media worker:
 *   TG_SUPABASE_URL         http://127.0.0.1:55321
 *   TG_SUPABASE_SECRET_KEY  the stack's secret key (`supabase status -o env`)
 *   TG_MEDIA_URL            http://127.0.0.1:8797
 * A Supabase URL that is not on this machine is refused unless `--remote` is given.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildMediaObjectUrl } from '@ramassa/shared/upload-client';
import { IMAGE_NAMES, TESTERS } from '../lib/ground';
import { cachePath, entryOf, readManifest } from './store';

const args = process.argv.slice(2);
const supabaseUrl = process.env.TG_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const mediaUrl = process.env.TG_MEDIA_URL ?? 'http://127.0.0.1:8797';
const secretKey = process.env.TG_SUPABASE_SECRET_KEY;
const emailIndex = args.indexOf('--email');
const email = emailIndex === -1 ? TESTERS[0]?.email : args[emailIndex + 1];
const prefixes = args.filter(
  (arg, index) => !arg.startsWith('--') && (emailIndex === -1 || index !== emailIndex + 1),
);

function fail(message: string): never {
  console.error(`\ncheck: ${message}\n`);
  process.exit(1);
}

if (secretKey === undefined || secretKey.length === 0) {
  fail('Set TG_SUPABASE_SECRET_KEY (SECRET_KEY from `supabase status -o env`).');
}
if (email === undefined) fail('No tester email.');
const host = new URL(supabaseUrl).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !args.includes('--remote')) {
  fail(`${supabaseUrl} is not on this machine; add --remote to check it on purpose.`);
}

const admin = { apikey: secretKey, authorization: `Bearer ${secretKey}` };

async function signIn(address: string): Promise<string> {
  const link = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { ...admin, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: address }),
  });
  if (!link.ok) fail(`generate_link for ${address}: ${link.status} ${await link.text()}`);
  const body = (await link.json()) as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
  };
  const tokenHash = body.hashed_token ?? body.properties?.hashed_token;
  if (tokenHash === undefined) fail('generate_link returned no hashed_token');

  const verify = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: secretKey ?? '', 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
  });
  if (!verify.ok) fail(`verify for ${address}: ${verify.status} ${await verify.text()}`);
  const session = (await verify.json()) as { access_token?: string };
  if (session.access_token === undefined) fail('verify returned no access_token');
  return session.access_token;
}

/** The columns that hold a storage key, per prefix (see the report of RAPP-885). */
const COLUMNS_BY_PREFIX: Readonly<Record<string, readonly [string, string][]>> = {
  gallery: [
    ['media_items', 'file_url'],
    ['media_items', 'thumbnail_url'],
  ],
  story: [['knowledge_articles', 'image_url']],
  activity: [],
  avis: [['announcements', 'image_url']],
  service: [['service_images', 'url']],
  guide: [['knowledge_articles', 'image_url']],
  forum: [
    ['forum_posts', 'image_url'],
    ['forum_replies', 'image_url'],
  ],
  avatar: [['profiles', 'avatar_url']],
};

async function rowsPointingAt(prefix: string, key: string): Promise<string[]> {
  const found: string[] = [];
  for (const [table, column] of COLUMNS_BY_PREFIX[prefix] ?? []) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${table}?select=id&${column}=eq.${encodeURIComponent(key)}`,
      { headers: admin },
    );
    if (!response.ok) continue;
    const rows = (await response.json()) as unknown[];
    if (rows.length > 0) found.push(`${table}.${column} x${rows.length}`);
  }
  return found;
}

const manifest = readManifest();
const token = await signIn(email);
console.log(`Signed in as ${email}; media worker ${mediaUrl}\n`);

let failures = 0;
for (const name of IMAGE_NAMES) {
  const prefix = name.slice(0, name.lastIndexOf('-'));
  if (prefixes.length > 0 && !prefixes.includes(prefix)) continue;
  const entry = entryOf(manifest, name);
  const response = await fetch(buildMediaObjectUrl(mediaUrl, entry.key), {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = new Uint8Array(await response.arrayBuffer());
  const same =
    response.status === 200 &&
    createHash('sha256').update(data).digest('hex') === entry.sha256 &&
    createHash('sha256').update(data).digest('hex') ===
      createHash('sha256')
        .update(readFileSync(cachePath(name)))
        .digest('hex');
  const rows = await rowsPointingAt(prefix, entry.key);
  if (!same) failures += 1;
  console.log(
    `${same ? 'ok  ' : 'FAIL'} ${name.padEnd(12)} ${response.status} ` +
      `${String(data.byteLength).padStart(7)} B  ${response.headers.get('content-type') ?? '-'}  ` +
      `rows: ${rows.length > 0 ? rows.join(', ') : 'none'}`,
  );
}
console.log(
  failures === 0 ? '\nEvery image served with the right bytes.' : `\n${failures} failed.`,
);
process.exit(failures === 0 ? 0 : 1);
