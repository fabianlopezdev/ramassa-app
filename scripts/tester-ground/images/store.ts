/**
 * Tester ground (RAPP-885): the 53 stock images and the bucket they live in.
 *
 *   bun scripts/tester-ground/images/store.ts manifest           rebuild manifest.json from sources.ts
 *   bun scripts/tester-ground/images/store.ts download           fill the cache, check every sha256
 *   bun scripts/tester-ground/images/store.ts upload --local     put the 53 objects in the local R2 simulation
 *   bun scripts/tester-ground/images/store.ts remove --local     delete exactly those 53 objects there
 *   bun scripts/tester-ground/images/store.ts upload --staging --yes
 *   bun scripts/tester-ground/images/store.ts remove --staging --yes
 *
 * Local means the R2 simulation that `wrangler dev` of `workers/media` reads in
 * this checkout (`workers/media/.wrangler/state`, or `--persist-to <dir>`).
 * Staging means the EU bucket of the `staging` environment in
 * `workers/media/wrangler.jsonc`, and nothing else: any other bucket is refused.
 *
 * The image files are never committed. They live in `.cache/` next to this
 * file, which git ignores; `download` recreates it from the manifest.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE_NAMES, TEAM, type ImageName } from '../lib/ground';
import { fileUrl, LICENCE, pageUrl, SOURCES, type ImageSource } from './sources';

/** The staging organization (slug `ramassa`); every key starts with it. */
export const ORG_ID = '2656ecb8-91e9-4a28-90e7-4c5ad7bbf1e3';
export const LOCAL_BUCKET = 'ramassa-media-dev';
export const STAGING_BUCKET = 'ramassa-media-staging';
const STAGING_JURISDICTION = 'eu';
/** The Cloudflare account of the staging environment in wrangler.jsonc. */
const STAGING_ACCOUNT_ID = 'c636c0649634aedd544d6a827b862d5a';
/** Year and month in every key, as the media worker would have written them. */
const KEY_PERIOD = '2026/11';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const MEDIA_WORKER = join(REPO, 'workers/media');
export const CACHE_DIR = join(HERE, '.cache');
export const MANIFEST_PATH = join(HERE, 'manifest.json');

/** The upload folder (`UPLOAD_FOLDERS`) each prefix of `IMAGE_NAMES` lands in. */
const FOLDER_BY_PREFIX: Readonly<Record<string, string>> = {
  gallery: 'gallery',
  story: 'stories',
  activity: 'events',
  avis: 'announcements',
  service: 'services',
  guide: 'knowledge-base',
  forum: 'forum',
  avatar: 'profile-photos',
};

export interface ManifestEntry {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly mime: 'image/jpeg';
  readonly sha256: string;
  readonly source: string;
  readonly url: string;
  readonly author: string;
  readonly licence: string;
  readonly shows: string;
}
export type Manifest = Readonly<Record<ImageName, ManifestEntry>>;

function fail(message: string): never {
  console.error(`\nstore: ${message}\n`);
  process.exit(1);
}

/** `<org>/<folder>/<uploader>/<yyyy>/<mm>/<32 hex>.jpg`, the shape the media worker serves. */
export function storageKey(name: ImageName): string {
  const prefix = name.slice(0, name.lastIndexOf('-'));
  const folder = FOLDER_BY_PREFIX[prefix];
  if (folder === undefined) fail(`No upload folder for the prefix of ${name}`);
  const uploader = sourceOf(name).uploader ?? TEAM.id;
  const file = createHash('md5').update(`tg:image:${name}`).digest('hex');
  return `${ORG_ID}/${folder}/${uploader}/${KEY_PERIOD}/${file}.jpg`;
}

export function sourceOf(name: ImageName): ImageSource {
  const source = SOURCES[name];
  if (source === undefined) fail(`sources.ts has no entry for ${name}`);
  return source;
}

export function entryOf(manifest: Manifest, name: ImageName): ManifestEntry {
  const entry = manifest[name];
  if (entry === undefined) fail(`manifest.json has no entry for ${name}`);
  return entry;
}

export function cachePath(name: ImageName): string {
  return join(CACHE_DIR, `${name}.jpg`);
}

export function readManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) fail('manifest.json is missing; run `store.ts manifest`.');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
  for (const name of IMAGE_NAMES) {
    entryOf(manifest, name);
  }
  return manifest;
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Width and height from the first JPEG start-of-frame marker. */
function jpegSize(data: Uint8Array): { width: number; height: number } {
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error('not a JPEG file');
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) throw new Error('broken JPEG marker');
    const marker = data[offset + 1] ?? 0;
    const length = ((data[offset + 2] ?? 0) << 8) | (data[offset + 3] ?? 0);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return {
        height: ((data[offset + 5] ?? 0) << 8) | (data[offset + 6] ?? 0),
        width: ((data[offset + 7] ?? 0) << 8) | (data[offset + 8] ?? 0),
      };
    }
    offset += 2 + length;
  }
  throw new Error('no JPEG frame found');
}

async function fetchImage(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  if (response.headers.get('content-type') !== 'image/jpeg') {
    throw new Error(`expected image/jpeg for ${url}, got ${response.headers.get('content-type')}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Rebuilds manifest.json from sources.ts, fetching every file into the cache. */
async function buildManifest(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const entries: Record<string, ManifestEntry> = {};
  for (const name of IMAGE_NAMES) {
    const source = sourceOf(name);
    const url = fileUrl(source.photo);
    const data = await fetchImage(url);
    const { width, height } = jpegSize(data);
    if (Math.max(width, height) > 1600) fail(`${name} is ${width}x${height}, over 1600 px`);
    writeFileSync(cachePath(name), data);
    entries[name] = {
      key: storageKey(name),
      width,
      height,
      bytes: data.byteLength,
      mime: 'image/jpeg',
      sha256: sha256(data),
      source: pageUrl(source.page),
      url,
      author: source.author,
      licence: LICENCE,
      shows: source.shows,
    };
    console.log(`${name}  ${width}x${height}  ${data.byteLength} B`);
  }
  const keys = new Set(Object.values(entries).map((entry) => entry.key));
  const shas = new Set(Object.values(entries).map((entry) => entry.sha256));
  if (keys.size !== IMAGE_NAMES.length) fail('two images share a storage key');
  if (shas.size !== IMAGE_NAMES.length) fail('two images are the same file');
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`\nWrote ${MANIFEST_PATH}`);
}

/** Fills the cache from the manifest; a file whose sha256 differs is refused. */
async function download(): Promise<void> {
  const manifest = readManifest();
  mkdirSync(CACHE_DIR, { recursive: true });
  let fetched = 0;
  for (const name of IMAGE_NAMES) {
    const entry = entryOf(manifest, name);
    const path = cachePath(name);
    if (existsSync(path) && sha256(readFileSync(path)) === entry.sha256) continue;
    const data = await fetchImage(entry.url);
    const actual = sha256(data);
    if (actual !== entry.sha256) {
      writeFileSync(`${path}.mismatch`, data);
      fail(
        `${name}: the CDN now serves a different file (sha256 ${actual}). ` +
          `Saved it as ${path}.mismatch. Run \`store.ts manifest\` and review the change.`,
      );
    }
    writeFileSync(`${path}.part`, data);
    renameSync(`${path}.part`, path);
    fetched += 1;
  }
  console.log(`Cache ready: ${IMAGE_NAMES.length} images (${fetched} fetched now) in ${CACHE_DIR}`);
}

interface Target {
  readonly bucket: string;
  readonly flags: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly label: string;
}

function readOption(args: readonly string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index === -1 ? undefined : args[index + 1];
}

function resolveTarget(args: readonly string[]): Target {
  const local = args.includes('--local');
  const staging = args.includes('--staging');
  if (local === staging) fail('Say where: --local or --staging --yes.');
  const bucket = readOption(args, '--bucket');

  if (local) {
    if (bucket !== undefined && bucket !== LOCAL_BUCKET) {
      fail(`--local only writes ${LOCAL_BUCKET}, the bucket wrangler dev simulates.`);
    }
    const persistTo = resolve(
      readOption(args, '--persist-to') ?? join(MEDIA_WORKER, '.wrangler/state'),
    );
    return {
      bucket: LOCAL_BUCKET,
      flags: ['--local', '--persist-to', persistTo],
      env: {},
      label: `local R2 simulation in ${persistTo}`,
    };
  }

  if (bucket !== undefined && bucket !== STAGING_BUCKET) {
    fail(`Refused: ${bucket} is not the staging bucket (${STAGING_BUCKET}).`);
  }
  const config = readFileSync(join(MEDIA_WORKER, 'wrangler.jsonc'), 'utf8');
  if (!config.includes(`"bucket_name": "${STAGING_BUCKET}"`)) {
    fail(`wrangler.jsonc no longer names ${STAGING_BUCKET}; check the staging bucket first.`);
  }
  if (!args.includes('--yes')) {
    fail(`This writes to the remote bucket ${STAGING_BUCKET}. Add --yes to go ahead.`);
  }
  return {
    bucket: STAGING_BUCKET,
    flags: ['--remote', '--jurisdiction', STAGING_JURISDICTION],
    env: { CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? STAGING_ACCOUNT_ID },
    label: `remote bucket ${STAGING_BUCKET} (${STAGING_JURISDICTION})`,
  };
}

function wrangler(target: Target, args: readonly string[]): void {
  const result = Bun.spawnSync(['bunx', 'wrangler', ...args, ...target.flags], {
    cwd: MEDIA_WORKER,
    env: { ...process.env, ...target.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    fail(`wrangler ${args.slice(0, 3).join(' ')} failed:\n${result.stderr.toString()}`);
  }
}

function upload(args: readonly string[]): void {
  const target = resolveTarget(args);
  const manifest = readManifest();
  for (const name of IMAGE_NAMES) {
    const path = cachePath(name);
    if (!existsSync(path) || sha256(readFileSync(path)) !== entryOf(manifest, name).sha256) {
      fail(`${name} is missing or changed in the cache; run \`store.ts download\` first.`);
    }
  }
  console.log(`Uploading ${IMAGE_NAMES.length} objects to the ${target.label}`);
  for (const name of IMAGE_NAMES) {
    const entry = entryOf(manifest, name);
    wrangler(target, [
      'r2',
      'object',
      'put',
      `${target.bucket}/${entry.key}`,
      '--file',
      cachePath(name),
      '--content-type',
      entry.mime,
    ]);
    console.log(`  put ${name}  ${entry.key}`);
  }
  console.log('Done.');
}

function remove(args: readonly string[]): void {
  const target = resolveTarget(args);
  const manifest = readManifest();
  console.log(`Deleting ${IMAGE_NAMES.length} objects from the ${target.label}`);
  for (const name of IMAGE_NAMES) {
    const entry = entryOf(manifest, name);
    wrangler(target, ['r2', 'object', 'delete', `${target.bucket}/${entry.key}`]);
    console.log(`  deleted ${name}  ${entry.key}`);
  }
  console.log('Done.');
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'manifest':
      await buildManifest();
      break;
    case 'download':
      await download();
      break;
    case 'upload':
      upload(args);
      break;
    case 'remove':
      remove(args);
      break;
    default:
      fail('Usage: store.ts manifest | download | upload|remove --local | --staging --yes');
  }
}
