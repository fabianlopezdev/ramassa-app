/**
 * The cumulative Maestro regression suite (RAPP-20).
 *
 *   bun run qa:smoke [--platform ios|android|both] [--only <substring>] [--metro-port <port>]
 *
 * `--only` narrows the run to the flows whose filename contains the substring.
 * It exists for ITERATING on one failing flow: a suite pass is minutes per
 * platform, and re-running all of it to see whether one selector now resolves
 * is how a green suite ends up taking an afternoon. A closure run never passes
 * it - the point of the suite is that everything earlier phases proved stays
 * proved.
 *
 * Every phase closure adds flows here and runs the whole suite, so what an
 * earlier phase proved stays proved. Android is the primary target: the players
 * this app is for are on low-end Android, so a green iOS run is not the answer
 * to "does it work".
 *
 * The flows live in `.maestro/` and are shared with nothing else, but they are
 * resolved by the SAME code the flow-capture harness uses (RAPP-78): a flow
 * declares the translated text it drives the UI by as `{{namespace:key}}` and
 * this resolves it against the app's own locale catalogs. That is deliberate.
 * Screen names living in two places is how a suite quietly stops testing the
 * screen it names.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadFlowConfig, repoRoot, type FlowConfig, type Pass } from './flow-capture/config';
import {
  ensureAndroidApp,
  ensureAndroidDevice,
  ensureIosApp,
  ensureIosDevice,
  pinAndroidStatusBar,
  pinIosStatusBar,
  reverseMetroPort,
  reverseSupabasePort,
} from './flow-capture/devices';
import { devClientUrl, writeResolvedFlow } from './flow-capture/resolve-flow';
import { ensureMetro } from './flow-capture/servers';
import { log, run, runOrThrow } from './flow-capture/shell';
import { loadTranslator } from './flow-capture/translations';
import { assertAndroidTabLabelsDrawn } from './qa-android-tab-labels';

const suiteDir = path.join(repoRoot, '.maestro');

/**
 * Rebuild the local seeded database before the suite runs (RAPP-28).
 *
 * Needed because one member CONSUMES seeded state: `smoke-onboarding` finishes
 * the wizard, which writes a profile for the profile-less intake account, and
 * the wizard gate then never fires for that account again. Without this the
 * flow would be green on its first run and, from the second on, would be
 * asserting against a screen it can no longer reach - a check that silently
 * stops testing the thing it is named after, which is the failure mode this
 * project has written down twice.
 *
 * Unconditional rather than "only when smoke-onboarding is in the run": a
 * cumulative suite whose result depends on what a previous run left behind is
 * not a regression net. It costs one reset per platform, and `qa:smoke` is a
 * closure gate, not a per-commit hook.
 *
 * Per PLATFORM, not once per invocation. The platforms run one after the other
 * against the SAME local database, so a single reset up front would let the
 * Android pass consume the intake account and leave the iOS pass signing in as
 * a woman who already has a profile: no wizard, and a failure that reads as a
 * broken gate on iOS only. Sequential execution is what makes this safe.
 *
 * `runOrThrow`, never `run`: a reset that failed silently would leave the suite
 * running against whatever state was already there, and every downstream
 * failure would name the wrong file. Local stack only, per contract rule 9 -
 * `supabase db reset` targets the Docker stack and has no remote target here.
 */
async function resetSeededDatabase(): Promise<void> {
  log('· resetting the local seeded database');
  await runOrThrow(['bunx', 'supabase', 'db', 'reset'], { cwd: repoRoot, inherit: true });
}

export interface SmokeResult {
  readonly flow: string;
  readonly platform: Pass;
  readonly passed: boolean;
}

/** Suite members only: a leading underscore marks a shared fragment. */
export function suiteFlows(fileNames: readonly string[]): readonly string[] {
  return fileNames.filter((name) => name.endsWith('.yaml') && !name.startsWith('_')).sort();
}

/**
 * Uses the bundle-id URL scheme that Expo registers alongside the public app
 * scheme. The public scheme is appropriate for product links, but a QA device
 * can contain another development client with a stale chooser prompt. This
 * scheme addresses the installed Ramassa app unambiguously.
 */
export function smokeDevClientUrl(
  platform: 'ios' | 'android',
  appId: string,
  publicScheme: string,
  metroPort: number,
): string {
  return devClientUrl(platform === 'ios' ? appId : publicScheme, metroPort);
}

export function parseSmokeMetroPort(rawPort: string | undefined): number | undefined {
  if (rawPort === undefined) return undefined;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('--metro-port needs a valid TCP port');
  }
  return port;
}

async function runSuiteOn(
  platform: 'ios' | 'android',
  config: FlowConfig,
  flows: readonly string[],
): Promise<SmokeResult[]> {
  await resetSeededDatabase();

  const device =
    platform === 'ios'
      ? await ensureIosDevice(config.devices.ios)
      : await ensureAndroidDevice(config.devices.android);
  if (platform === 'ios') {
    await ensureIosApp(device, config.appId);
    await pinIosStatusBar(device);
  } else {
    await ensureAndroidApp(device, config.appId);
    await pinAndroidStatusBar(device);
  }

  const metro = await ensureMetro(config.metroPort, config.scheme);
  if (platform === 'android') {
    await reverseMetroPort(device, metro.port);
    await reverseSupabasePort(device, process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');
  }

  // Every fragment is resolved too, not just the suite members: `runFlow` reads
  // the file on disk, so an unresolved fragment would drive the UI by a literal
  // `{{nav:tabs.home}}`.
  //
  // The dev-client URL is only supplied to the flows that declare it, because
  // the resolver treats an undeclared override as an authoring mistake - which
  // it is, for a capture flow, and that check is worth keeping.
  const translate = await loadTranslator('ca');
  const clientUrl = smokeDevClientUrl(platform, config.appId, config.scheme, metro.port);
  for (const file of (await readdir(suiteDir)).filter((name) => name.endsWith('.yaml'))) {
    const source = path.join(suiteDir, file);
    const declaresClientUrl = (await Bun.file(source).text()).includes('DEV_CLIENT_URL:');
    await writeResolvedFlow(
      source,
      translate,
      declaresClientUrl ? { DEV_CLIENT_URL: clientUrl } : {},
    );
  }

  const results: SmokeResult[] = [];
  try {
    for (const flow of flows) {
      log(`\n▸ ${flow} on ${platform} (${device})`);
      const resolved = path.join(repoRoot, '.flow-shots', flow);
      const { exitCode } = await run(['maestro', '--device', device, 'test', resolved], {
        cwd: path.join(repoRoot, '.flow-shots'),
        inherit: true,
      });
      let passed = exitCode === 0;
      if (passed && platform === 'android' && flow === 'smoke-shells.yaml') {
        try {
          await assertAndroidTabLabelsDrawn(device);
        } catch (error) {
          console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
          passed = false;
        }
      }
      results.push({ flow, platform, passed });
    }
  } finally {
    await metro.stop();
  }
  return results;
}

export async function runSmokeSuite(
  platforms: readonly ('ios' | 'android')[],
  only?: string,
  metroPortOverride?: number,
): Promise<boolean> {
  const loadedConfig = await loadFlowConfig();
  const config =
    metroPortOverride === undefined
      ? loadedConfig
      : { ...loadedConfig, metroPort: metroPortOverride };
  const all = suiteFlows(await readdir(suiteDir));
  const flows = only === undefined ? all : all.filter((flow) => flow.includes(only));
  if (all.length === 0) {
    throw new Error(`No smoke flows in ${suiteDir}`);
  }
  if (flows.length === 0) {
    throw new Error(`No smoke flow matches --only ${only}. Have: ${all.join(', ')}`);
  }
  if (flows.length !== all.length) {
    log(`· --only ${only}: running ${flows.length} of ${all.length} flows`);
  }

  const results: SmokeResult[] = [];
  try {
    for (const platform of platforms) {
      results.push(...(await runSuiteOn(platform, config, flows)));
    }
  } finally {
    // Leave the database as the rest of the repo expects to find it.
    //
    // `smoke-onboarding` finishes the wizard, which SPENDS the intake account's
    // invitation, and two pgTAP assertions are about exactly that invite
    // ("completing onboarding marks the invite as spent", "a spent invite
    // prefills nothing on a second run"). pgTAP runs inside `bun test`, which is
    // a pre-commit gate - so without this a QA run leaves the repo unable to
    // commit, and the red points at a seed-data file that is perfectly correct.
    //
    // In a `finally`, because a suite that fails half way through has left the
    // database in exactly the state that needs clearing up.
    await resetSeededDatabase();
  }

  log('\n─── smoke suite ───');
  for (const result of results) {
    log(`${result.passed ? '✓' : '✗'} ${result.flow} · ${result.platform}`);
  }
  const failed = results.filter((result) => !result.passed);
  log(`${results.length - failed.length}/${results.length} passed`);
  return failed.length === 0;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf('--platform');
  const requested = index === -1 ? 'android' : argv[index + 1];
  const onlyIndex = argv.indexOf('--only');
  const only = onlyIndex === -1 ? undefined : argv[onlyIndex + 1];
  const metroPortIndex = argv.indexOf('--metro-port');
  const metroPort = parseSmokeMetroPort(
    metroPortIndex === -1 ? undefined : argv[metroPortIndex + 1],
  );
  if (onlyIndex !== -1 && (only === undefined || only.startsWith('--'))) {
    console.error('--only needs a flow-name substring, e.g. --only i18n');
    process.exit(1);
  }
  if (
    metroPortIndex !== -1 &&
    (argv[metroPortIndex + 1] === undefined || argv[metroPortIndex + 1]!.startsWith('--'))
  ) {
    console.error('--metro-port needs a valid TCP port');
    process.exit(1);
  }
  const platforms =
    requested === 'both' ? (['android', 'ios'] as const) : ([requested] as ('ios' | 'android')[]);
  if (!platforms.every((platform) => platform === 'ios' || platform === 'android')) {
    console.error('--platform must be ios, android or both (default: android)');
    process.exit(1);
  }
  try {
    process.exit((await runSmokeSuite(platforms, only, metroPort)) ? 0 : 1);
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
