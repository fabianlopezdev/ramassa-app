/**
 * The QA run's own Supabase stack (RAPP-500).
 *
 * `qa:smoke` used to reset the ONE local stack every session on this Mac shares
 * (project `ramassa`, ports 543xx), twice per platform. Any other session working
 * against that database lost its state mid-task, and the suite had to wait for
 * them in turn. The QA run now owns a second stack under its own project id and
 * ports, built from THIS checkout's `supabase/` directory, so it can reset as
 * often as it likes and the dev database is never touched.
 *
 * The stack lives in `.qa-supabase/` (gitignored): a copy of `supabase/` whose
 * config differs only in the project id, the ports and the services the app
 * never calls. It is copied on every run, so a branch with a new migration gets
 * it at the next reset.
 */

import { createHash } from 'node:crypto';
import { cp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repoRoot } from '../flow-capture/config';
import { log, run, runOrThrow } from '../flow-capture/shell';

export const QA_PROJECT_ID = 'ramassa-qa';

/** 543xx in the dev config becomes 573xx here. 55xxx is taken by another isolated stack. */
const QA_PORT_OFFSET = 3000;

/** Services nothing in the smoke suite calls. Skipping them saves memory and boot time. */
const EXCLUDED_SERVICES = ['studio', 'postgres-meta', 'logflare', 'vector', 'imgproxy'];

export const qaWorkdir = path.join(repoRoot, '.qa-supabase');

export interface QaStackEnv {
  readonly apiUrl: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  readonly dbUrl: string;
}

/**
 * The dev `config.toml`, moved to the QA project id and ports. Pure, so the
 * port mapping is tested without Docker.
 */
export function qaConfigToml(devConfig: string): string {
  return devConfig
    .replace(/^project_id\s*=\s*".*"$/m, `project_id = "${QA_PROJECT_ID}"`)
    .replace(
      /^(\s*(?:port|shadow_port|smtp_port|pop3_port)\s*=\s*)(\d+)/gm,
      (_match, prefix: string, port: string) => `${prefix}${Number(port) + QA_PORT_OFFSET}`,
    )
    .replace(/^(\s*inspector_port\s*=\s*)\d+/m, (_match, prefix: string) => `${prefix}57383`);
}

export function qaApiPort(devConfig: string): number {
  const match = /^\[api\][\s\S]*?^port\s*=\s*(\d+)/m.exec(qaConfigToml(devConfig));
  if (match?.[1] === undefined) throw new Error('No [api] port in supabase/config.toml');
  return Number(match[1]);
}

/** Parses `supabase status -o env`. Values stay in memory and are never logged. */
export function parseStatusEnv(output: string): QaStackEnv {
  const values = new Map<string, string>();
  for (const line of output.split('\n')) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) values.set(match[1], match[2]);
  }
  const read = (key: string): string => {
    const value = values.get(key);
    if (value === undefined || value === '') {
      throw new Error(`supabase status for ${QA_PROJECT_ID} has no ${key}`);
    }
    return value;
  };
  return {
    apiUrl: read('API_URL'),
    anonKey: read('ANON_KEY'),
    serviceRoleKey: read('SERVICE_ROLE_KEY'),
    dbUrl: read('DB_URL'),
  };
}

/**
 * Hash of the config the running stack was started with. A change (new auth
 * setting, new service) needs a restart, because `supabase start` on a running
 * stack is a no-op. Kept in tmpdir because the stack is shared by every
 * checkout on this Mac, one run at a time.
 */
const startedConfigHashFile = path.join(tmpdir(), `${QA_PROJECT_ID}-config.sha256`);

async function syncWorkdir(): Promise<string> {
  const source = path.join(repoRoot, 'supabase');
  const target = path.join(qaWorkdir, 'supabase');
  await rm(qaWorkdir, { recursive: true, force: true });
  await mkdir(qaWorkdir, { recursive: true });
  await cp(source, target, {
    recursive: true,
    filter: (file) => !/[/\\](\.temp|\.branches)([/\\]|$)/.test(file),
  });
  const devConfig = await Bun.file(path.join(source, 'config.toml')).text();
  const config = qaConfigToml(devConfig);
  await Bun.write(path.join(target, 'config.toml'), config);
  return createHash('sha256').update(config).digest('hex');
}

function supabase(args: readonly string[]): string[] {
  return ['bunx', 'supabase', ...args, '--workdir', qaWorkdir];
}

async function isRunning(): Promise<boolean> {
  const { stdout } = await run([
    'docker',
    'ps',
    '--filter',
    `label=com.supabase.cli.project=${QA_PROJECT_ID}`,
    '--format',
    '{{.Names}}',
  ]);
  return stdout.includes(`supabase_db_${QA_PROJECT_ID}`);
}

/**
 * Starts (or reuses) the QA stack, applies THIS checkout's migrations and seed,
 * and returns the values the app and the scripts need to reach it.
 */
export async function prepareQaStack(): Promise<QaStackEnv> {
  const configHash = await syncWorkdir();
  const hashFile = Bun.file(startedConfigHashFile);
  const startedWith = (await hashFile.exists()) ? (await hashFile.text()).trim() : '';

  if ((await isRunning()) && startedWith !== configHash) {
    log(`· ${QA_PROJECT_ID}: config changed since it started, restarting it`);
    await runOrThrow(supabase(['stop']), { cwd: repoRoot });
  }
  if (!(await isRunning())) {
    log(`· starting the QA Supabase stack (${QA_PROJECT_ID})`);
    await runOrThrow(supabase(['start', '-x', EXCLUDED_SERVICES.join(',')]), {
      cwd: repoRoot,
      inherit: true,
    });
    await Bun.write(startedConfigHashFile, configHash);
  }

  // The CLI restarts the API containers at the end of a reset and can catch the
  // gateway mid-restart ("Error status 502"). The database itself is already
  // rebuilt by then, so the reset is simply run again.
  for (let attempt = 1; ; attempt += 1) {
    log(
      `· resetting the QA database (${QA_PROJECT_ID})${attempt > 1 ? `, attempt ${attempt}` : ''}`,
    );
    const { exitCode } = await run(supabase(['db', 'reset']), { cwd: repoRoot, inherit: true });
    if (exitCode === 0) break;
    if (attempt === 3) throw new Error(`supabase db reset failed 3 times on ${QA_PROJECT_ID}`);
    await Bun.sleep(5000);
  }

  const { stdout } = await runOrThrow(supabase(['status', '-o', 'env']), { cwd: repoRoot });
  return parseStatusEnv(stdout);
}

/**
 * Refuses a URL that could be the shared dev stack. The QA stack's API port is
 * derived from the same config, so a mistake here would point the suite back
 * at the database this module exists to keep it away from.
 */
export function assertQaStackUrl(apiUrl: string, devApiPort: number): void {
  const port = Number(new URL(apiUrl).port);
  if (port === devApiPort) {
    throw new Error(`QA stack URL ${apiUrl} uses the dev API port ${devApiPort}; refusing to run.`);
  }
}

/** Runs SQL against the QA database only. */
export async function qaSql(sql: string): Promise<void> {
  await runOrThrow(
    [
      'docker',
      'exec',
      '-i',
      `supabase_db_${QA_PROJECT_ID}`,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      sql,
    ],
    { cwd: repoRoot },
  );
}
