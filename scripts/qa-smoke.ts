/**
 * The cumulative Maestro regression suite (RAPP-20).
 *
 *   bun run qa:smoke [--platform ios|android|both] [--only <substring>]
 *                    [--shards <n>] [--metro-port <first port>]
 *
 * Since RAPP-500 a run never touches the shared dev database or simulator. It
 * resets its own Supabase stack (`ramassa-qa`, ports 573xx, see
 * `qa-smoke/supabase-stack.ts`), serves the app from its own Metro pointed at
 * that stack, and on iOS splits the flows across `--shards` simulators of its
 * own (default 3, `qa-smoke/shards.ts` says which flows must share one). One
 * run at a time holds the stack and simulators; a second run waits for it.
 *
 * `--only` narrows the run to the flows whose filename contains the substring
 * (or any of several, comma-separated).
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

import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadFlowConfig, repoRoot, type FlowConfig, type Pass } from './flow-capture/config';
import {
  ensureAndroidApp,
  ensureAndroidDevice,
  pinAndroidStatusBar,
  reverseMetroPort,
  reverseSupabasePort,
} from './flow-capture/devices';
import { devClientUrl, writeResolvedFlow } from './flow-capture/resolve-flow';
import { log, runOrThrow } from './flow-capture/shell';
import { loadTranslator } from './flow-capture/translations';
import { assertAndroidTabLabelsDrawn } from './qa-android-tab-labels';
import { prepareIosPool } from './qa-smoke/ios-pool';
import { acquireQaLock } from './qa-smoke/lock';
import { isDriverFailure, prepareMaestroHome, runMaestroFlow } from './qa-smoke/maestro-run';
import { prewarmBundle, startQaMetro } from './qa-smoke/metro';
import { planShards, sqlBefore, type Shard } from './qa-smoke/shards';
import { assertQaStackUrl, prepareQaStack, QA_PROJECT_ID, qaSql } from './qa-smoke/supabase-stack';

export { maestroSmokeCommand } from './qa-smoke/maestro-run';

const suiteDir = path.join(repoRoot, '.maestro');
const flowShotsDir = path.join(repoRoot, '.flow-shots');
const durationsPath = path.join(flowShotsDir, 'qa-smoke-durations.json');

/** The dev stack's API port. The QA run refuses any backend URL on it. */
const DEV_API_PORT = 54321;

/** First port the QA Metro tries. Far from the dev Metros on 8081/8082. */
const QA_METRO_FIRST_PORT = 8190;

/** Three simulators by default: the measured sweet spot is in the RAPP-500 notes. */
const DEFAULT_IOS_SHARDS = 3;

export interface SmokeResult {
  readonly flow: string;
  readonly platform: Pass;
  readonly passed: boolean;
  readonly seconds: number;
  readonly shard: number;
  readonly note?: string;
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

export function parseShardCount(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1 || count > 8) {
    throw new Error('--shards needs a whole number from 1 to 8');
  }
  return count;
}

function minutes(seconds: number): string {
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
}

async function readMeasuredDurations(): Promise<Record<string, number>> {
  const file = Bun.file(durationsPath);
  return (await file.exists()) ? ((await file.json()) as Record<string, number>) : {};
}

/**
 * Every fragment is resolved too, not just the suite members: `runFlow` reads
 * the file on disk, so an unresolved fragment would drive the UI by a literal
 * `{{nav:tabs.home}}`.
 *
 * The dev-client URL is only supplied to the flows that declare it, because
 * the resolver treats an undeclared override as an authoring mistake - which
 * it is, for a capture flow, and that check is worth keeping.
 * Scripts a flow runs with `runScript` are read relative to the flow, which
 * runs from `.flow-shots/`, so they are copied next to the resolved flows.
 */
async function resolveSuite(clientUrl: string): Promise<void> {
  for (const file of (await readdir(suiteDir)).filter((name) => name.endsWith('.js'))) {
    await Bun.write(path.join(flowShotsDir, file), Bun.file(path.join(suiteDir, file)));
  }
  const translate = await loadTranslator('ca');
  for (const file of (await readdir(suiteDir)).filter((name) => name.endsWith('.yaml'))) {
    const source = path.join(suiteDir, file);
    const declaresClientUrl = (await Bun.file(source).text()).includes('DEV_CLIENT_URL:');
    await writeResolvedFlow(
      source,
      translate,
      declaresClientUrl ? { DEV_CLIENT_URL: clientUrl } : {},
    );
  }
}

async function runShard(
  platform: 'ios' | 'android',
  device: string,
  shard: Shard,
  shardCount: number,
): Promise<SmokeResult[]> {
  const label = shardCount === 1 ? `[${platform}]` : `[${platform} ${shard.index + 1}]`;
  const maestroHome = path.join(flowShotsDir, 'maestro-home', `${platform}-${shard.index + 1}`);
  await prepareMaestroHome(maestroHome);
  const results: SmokeResult[] = [];
  for (const [position, flow] of shard.flows.entries()) {
    if (platform === 'android') {
      // Offline flows use real airplane mode. A failed assertion can stop a
      // flow before its second toggle, and the AVD persists that state across
      // app clears and emulator restarts. Normalize connectivity before every
      // flow so one failure cannot turn the rest of the suite into skeleton
      // timeouts that name unrelated screens.
      await runOrThrow(
        ['adb', '-s', device, 'shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'],
        { cwd: repoRoot },
      );
    }
    const sql = sqlBefore(flow, shard.flows.slice(0, position));
    if (sql !== undefined) {
      log(`${label} · undoing the previous survey response on ${QA_PROJECT_ID}`);
      await qaSql(sql);
    }
    log(`\n${label} ▸ ${flow} (${position + 1}/${shard.flows.length})`);
    const runOnce = async (): Promise<Awaited<ReturnType<typeof runMaestroFlow>>> =>
      await runMaestroFlow({
        device,
        flowFile: path.join(flowShotsDir, flow),
        cwd: flowShotsDir,
        debugOutputDir: path.join(flowShotsDir, 'debug', platform, flow),
        maestroHome,
        label,
        skipAdb: platform === 'ios',
      });
    let outcome = await runOnce();
    let retried = false;
    if (!outcome.passed && isDriverFailure(outcome.failure, outcome.note)) {
      log(
        `${label} · ${flow}: device driver failed (${outcome.failure ?? outcome.note}), running it once more`,
      );
      retried = true;
      outcome = await runOnce();
    }
    let passed = outcome.passed;
    if (passed && platform === 'android' && flow === 'smoke-shells.yaml') {
      try {
        await assertAndroidTabLabelsDrawn(device);
      } catch (error) {
        console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
        passed = false;
      }
    }
    if (outcome.note !== undefined) log(`${label} · ${flow}: ${outcome.note}`);
    if (!passed && outcome.failure !== undefined) log(`${label} · ${flow}: ${outcome.failure}`);
    log(`${label} ${passed ? '✓' : '✗'} ${flow} in ${minutes(outcome.seconds)}`);
    results.push({
      flow,
      platform,
      passed,
      seconds: outcome.seconds,
      shard: shard.index,
      note: retried
        ? `retried after a driver failure${outcome.note === undefined ? '' : `; ${outcome.note}`}`
        : outcome.note,
    });
  }
  return results;
}

/**
 * One platform: a freshly reset QA database, the QA run's own Metro pointed at
 * it, and the flows split across the devices. iOS gets `shardCount` simulators;
 * Android runs on the one project AVD.
 */
async function runSuiteOn(
  platform: 'ios' | 'android',
  config: FlowConfig,
  flows: readonly string[],
  shardCount: number,
  metroFirstPort: number,
): Promise<SmokeResult[]> {
  const started = Date.now();
  const elapsed = (): string => minutes(Math.round((Date.now() - started) / 1000));

  // Simulators boot while the stack resets; neither needs the other.
  const devicesReady =
    platform === 'ios'
      ? prepareIosPool(config.devices.ios, config.appId, shardCount)
      : (async () => {
          const serial = await ensureAndroidDevice(config.devices.android);
          await ensureAndroidApp(serial, config.appId);
          await pinAndroidStatusBar(serial);
          return { udids: [serial], shutdown: async () => {} };
        })();
  // A rejected promise nobody awaits yet would crash the process before the
  // stack is ready, so the failure is held until it is awaited below.
  devicesReady.catch(() => {});

  const shutDownDevices = async (): Promise<void> => {
    await devicesReady.then(async (ready) => await ready.shutdown()).catch(() => {});
  };
  let metro: Awaited<ReturnType<typeof startQaMetro>>;
  let stackUrl: string;
  try {
    const stack = await prepareQaStack();
    assertQaStackUrl(stack.apiUrl, DEV_API_PORT);
    log(`· QA stack ready at ${stack.apiUrl} after ${elapsed()}`);
    metro = await startQaMetro(metroFirstPort, config.scheme, {
      EXPO_PUBLIC_SUPABASE_URL: stack.apiUrl,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: stack.anonKey,
    });
    stackUrl = stack.apiUrl;
  } catch (error) {
    await shutDownDevices();
    throw error;
  }
  const pool = await devicesReady.catch(async (error: unknown) => {
    await metro.stop();
    throw error;
  });
  try {
    await prewarmBundle(metro.port, platform);
    if (platform === 'android') {
      await reverseMetroPort(pool.udids[0]!, metro.port);
      await reverseSupabasePort(pool.udids[0]!, stackUrl);
    }
    await resolveSuite(smokeDevClientUrl(platform, config.appId, config.scheme, metro.port));

    const shards = planShards(flows, pool.udids.length, await readMeasuredDurations());
    log(`· ready to run after ${elapsed()}; ${shards.length} shard(s):`);
    for (const shard of shards) {
      log(`  ${shard.index + 1}: ~${minutes(shard.estimatedSeconds)} · ${shard.flows.join(', ')}`);
    }
    const perShard = await Promise.all(
      shards.map(
        async (shard) => await runShard(platform, pool.udids[shard.index]!, shard, shards.length),
      ),
    );
    log(`· ${platform} finished in ${elapsed()}`);
    return perShard.flat();
  } finally {
    await metro.stop();
    await pool.shutdown();
  }
}

async function recordDurations(results: readonly SmokeResult[]): Promise<void> {
  const measured = await readMeasuredDurations();
  for (const result of results) {
    // Failures stop early, so only a pass is a fair estimate for the next split.
    if (result.passed && result.platform === 'ios') measured[result.flow] = result.seconds;
  }
  await mkdir(flowShotsDir, { recursive: true });
  await Bun.write(durationsPath, `${JSON.stringify(measured, null, 2)}\n`);
}

export async function runSmokeSuite(
  platforms: readonly ('ios' | 'android')[],
  only?: string,
  metroPortOverride?: number,
  shardCount = DEFAULT_IOS_SHARDS,
): Promise<boolean> {
  const config = await loadFlowConfig();
  const all = suiteFlows(await readdir(suiteDir));
  const wanted = only?.split(',').filter((part) => part !== '');
  const flows =
    wanted === undefined ? all : all.filter((flow) => wanted.some((part) => flow.includes(part)));
  if (all.length === 0) {
    throw new Error(`No smoke flows in ${suiteDir}`);
  }
  if (flows.length === 0) {
    throw new Error(`No smoke flow matches --only ${only}. Have: ${all.join(', ')}`);
  }
  if (flows.length !== all.length) {
    log(`· --only ${only}: running ${flows.length} of ${all.length} flows`);
  }

  const started = Date.now();
  const release = await acquireQaLock(repoRoot);
  const results: SmokeResult[] = [];
  try {
    for (const platform of platforms) {
      results.push(
        ...(await runSuiteOn(
          platform,
          config,
          flows,
          platform === 'ios' ? shardCount : 1,
          metroPortOverride ?? QA_METRO_FIRST_PORT,
        )),
      );
    }
  } finally {
    await release();
  }
  await recordDurations(results);

  log('\n─── smoke suite ───');
  for (const result of results) {
    log(
      `${result.passed ? '✓' : '✗'} ${result.flow} · ${result.platform} · shard ${result.shard + 1} · ` +
        `${minutes(result.seconds)}${result.note === undefined ? '' : ` · ${result.note}`}`,
    );
  }
  const failed = results.filter((result) => !result.passed);
  const flowSeconds = results.reduce((sum, result) => sum + result.seconds, 0);
  log(
    `${results.length - failed.length}/${results.length} passed in ` +
      `${minutes(Math.round((Date.now() - started) / 1000))} wall clock ` +
      `(${minutes(flowSeconds)} of flow time)`,
  );
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
  const shardsIndex = argv.indexOf('--shards');
  const shards = parseShardCount(shardsIndex === -1 ? undefined : argv[shardsIndex + 1]);
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
    process.exit((await runSmokeSuite(platforms, only, metroPort, shards)) ? 0 : 1);
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
