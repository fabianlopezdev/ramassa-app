/**
 * Tester ground runner (RAPP-885). See README.md next to this file.
 *
 *   bun run tester-ground seed                 publish every module
 *   bun run tester-ground renew <1-4|all>      make things new again for a tester
 *   bun run tester-ground remove               delete everything the modules created
 *   bun run tester-ground print <command> ...  write that command's SQL to a file, run nothing
 *
 * Flags:
 *   --staging --yes   run on the linked staging project (ref checked) instead of the local database
 *   --placeholders    fixed image placeholders instead of images/manifest.json (local only)
 *   --out <file>      where `print` writes (default ./tester-ground-<command>.sql)
 *
 * Every command is all or nothing: locally it runs inside one transaction; on
 * staging the file goes to the Management API as one message, which Postgres
 * runs as one implicit transaction.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SQL } from 'bun';
import { lit, TESTERS, type Account, type GroundModule } from './lib/ground';
import { MODULES } from './modules/index';

const STAGING_PROJECT_REF = 'lzxqzpwetvvmybzbigly';
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const HERE = import.meta.dir;
const REPO_ROOT = resolve(HERE, '../..');
const MANIFEST_PATH = join(HERE, 'images/manifest.json');

/** What a tester has opened or visited: the Home seen items and the tab news. */
const READ_TABLES = [
  'announcement_reads',
  'event_reads',
  'forum_post_reads',
  'media_item_reads',
  'knowledge_article_reads',
  'service_reads',
  'mentoring_request_reads',
  'feedback_submission_reads',
  'list_visits',
] as const;

type Command =
  | { readonly kind: 'seed' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'renew'; readonly testers: readonly Account[]; readonly label: string };

interface Options {
  readonly staging: boolean;
  readonly yes: boolean;
  readonly placeholders: boolean;
  readonly out: string | null;
}

function fail(message: string): never {
  console.error(`tester-ground: ${message}`);
  process.exit(1);
}

function parseArgs(argv: readonly string[]): {
  print: boolean;
  command: Command;
  options: Options;
} {
  const positional: string[] = [];
  let staging = false;
  let yes = false;
  let placeholders = false;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--staging') staging = true;
    else if (arg === '--yes') yes = true;
    else if (arg === '--placeholders') placeholders = true;
    else if (arg === '--out') {
      out = argv[i + 1] ?? fail('--out needs a file');
      i += 1;
    } else if (arg.startsWith('--')) fail(`unknown flag ${arg}`);
    else positional.push(arg);
  }
  const print = positional[0] === 'print';
  const [name, target] = print ? positional.slice(1) : positional;
  return {
    print,
    command: parseCommand(name, target),
    options: { staging, yes, placeholders, out },
  };
}

function parseCommand(name: string | undefined, target: string | undefined): Command {
  if (name === 'seed' || name === 'remove') return { kind: name };
  if (name === 'renew') {
    if (target === 'all') return { kind: 'renew', testers: TESTERS, label: 'all' };
    const tester = TESTERS[Number(target) - 1];
    if (tester === undefined || !/^[1-4]$/.test(target ?? ''))
      fail('renew takes 1, 2, 3, 4 or all');
    return { kind: 'renew', testers: [tester], label: target as string };
  }
  return fail('usage: run.ts seed | renew <1-4|all> | remove | print <command> [flags]');
}

// SQL --------------------------------------------------------------------------------------

function byOrder(modules: readonly GroundModule[]): GroundModule[] {
  return [...modules].sort((a, b) => a.order - b.order);
}

function section(groundModule: GroundModule, step: string, sql: string): string {
  return sql.trim() === '' ? '' : `-- == ${groundModule.name}: ${step} ==\n${sql.trim()}\n`;
}

function forgetWhatSheSaw(tester: Account): string {
  const lines = READ_TABLES.map(
    (table) => `delete from public.${table} where user_id = ${lit(tester.id)}::uuid;`,
  );
  return `-- == ${tester.key}: everything she opened or visited counts as unseen again ==\n${lines.join('\n')}\n`;
}

function buildSql(command: Command): string {
  const modules = byOrder(MODULES);
  const parts: string[] = [];
  if (command.kind === 'seed') {
    for (const m of modules) parts.push(section(m, 'publish', m.publish()));
  } else if (command.kind === 'remove') {
    for (const m of modules.reverse()) parts.push(section(m, 'remove', m.remove()));
  } else {
    for (const tester of command.testers) {
      parts.push(forgetWhatSheSaw(tester));
      for (const m of modules)
        parts.push(section(m, `renew ${tester.key}`, m.renew?.(tester) ?? ''));
    }
  }
  const title = command.kind === 'renew' ? `renew ${command.label}` : command.kind;
  return `-- Tester ground (RAPP-885): ${title}\n\n${parts.filter((p) => p !== '').join('\n')}`;
}

// Images -----------------------------------------------------------------------------------

interface ManifestEntry {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly mime: string;
}

const IMAGE_TOKEN = /\{\{image:([a-z0-9-]+):([a-z]+)\}\}/g;

const PLACEHOLDER: Readonly<Record<string, (name: string) => string>> = {
  key: (name) => `'tester-ground/${name}.jpg'`,
  width: () => '1600',
  height: () => '1067',
  bytes: () => '250000',
  mime: () => `'image/jpeg'`,
};

function manifestValue(entry: ManifestEntry, field: string): string | null {
  if (field === 'key' || field === 'mime') {
    const value = entry[field];
    return typeof value === 'string' && value !== '' ? lit(value) : null;
  }
  if (field === 'width' || field === 'height' || field === 'bytes') {
    const value = entry[field];
    return Number.isInteger(value) && value > 0 ? String(value) : null;
  }
  return null;
}

/** Replaces every image token, or stops before any SQL runs when one cannot be resolved. */
function resolveImages(sql: string, options: Options): string {
  const tokens = [...sql.matchAll(IMAGE_TOKEN)];
  if (tokens.length === 0) return sql;
  if (options.placeholders && options.staging) fail('--placeholders is for a local run only');
  const usePlaceholders = options.placeholders || (!options.staging && !existsSync(MANIFEST_PATH));
  if (usePlaceholders) {
    return sql.replaceAll(IMAGE_TOKEN, (token, name: string, field: string) => {
      const placeholder = PLACEHOLDER[field];
      if (placeholder === undefined) fail(`unknown image field in ${token}`);
      return placeholder(name);
    });
  }
  if (!existsSync(MANIFEST_PATH)) {
    fail(`no image manifest at ${MANIFEST_PATH}; upload the images first`);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, ManifestEntry>;
  const problems = new Set<string>();
  const resolved = sql.replaceAll(IMAGE_TOKEN, (token, name: string, field: string) => {
    const entry = manifest[name];
    const value = entry === undefined ? null : manifestValue(entry, field);
    if (value === null) {
      problems.add(
        entry === undefined ? `${name} is not in the manifest` : `${token} has no valid value`,
      );
      return token;
    }
    return value;
  });
  if (problems.size > 0) fail(`images missing, nothing was run:\n  ${[...problems].join('\n  ')}`);
  return resolved;
}

// Targets ----------------------------------------------------------------------------------

async function runLocal(sql: string): Promise<void> {
  const url = process.env.TESTER_GROUND_DB_URL ?? DEFAULT_DB_URL;
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    fail(`TESTER_GROUND_DB_URL must point at a local database (got host ${host}); use --staging`);
  }
  const db = new SQL(url);
  try {
    await db.begin(async (tx) => {
      await tx.unsafe(sql);
    });
  } finally {
    await db.close();
  }
  console.log(`tester-ground: done on ${host}:${new URL(url).port}`);
}

function runStaging(sql: string, options: Options): void {
  if (!options.yes) fail('a staging run needs --staging --yes');
  const workdir = process.env.TESTER_GROUND_SUPABASE_WORKDIR ?? REPO_ROOT;
  const refFile = join(workdir, 'supabase/.temp/project-ref');
  const ref = existsSync(refFile) ? readFileSync(refFile, 'utf8').trim() : '';
  if (ref !== STAGING_PROJECT_REF) {
    fail(`the linked project in ${workdir} is "${ref || 'none'}", which is not staging; refused`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'tester-ground-'));
  const file = join(dir, 'run.sql');
  try {
    writeFileSync(file, sql);
    const result = spawnSync(
      'supabase',
      ['--workdir', workdir, 'db', 'query', '--linked', '--agent=no', '-o', 'table', '-f', file],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) fail('the staging run failed; nothing was changed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log('tester-ground: done on staging');
}

// Main -------------------------------------------------------------------------------------

const { print, command, options } = parseArgs(process.argv.slice(2));
const sql = resolveImages(buildSql(command), options);

if (print) {
  const name = command.kind === 'renew' ? `renew-${command.label}` : command.kind;
  const out = resolve(options.out ?? `tester-ground-${name}.sql`);
  writeFileSync(out, sql);
  console.log(`tester-ground: wrote ${out}`);
} else if (options.staging) {
  runStaging(sql, options);
} else {
  await runLocal(sql);
}
