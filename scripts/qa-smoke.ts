/**
 * The cumulative Maestro regression suite (RAPP-20).
 *
 *   bun run qa:smoke [--platform ios|android|both]
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
} from './flow-capture/devices';
import { devClientUrl, writeResolvedFlow } from './flow-capture/resolve-flow';
import { ensureMetro } from './flow-capture/servers';
import { log, run } from './flow-capture/shell';
import { loadTranslator } from './flow-capture/translations';

const suiteDir = path.join(repoRoot, '.maestro');

export interface SmokeResult {
  readonly flow: string;
  readonly platform: Pass;
  readonly passed: boolean;
}

/** Suite members only: a leading underscore marks a shared fragment. */
export function suiteFlows(fileNames: readonly string[]): readonly string[] {
  return fileNames.filter((name) => name.endsWith('.yaml') && !name.startsWith('_')).sort();
}

async function runSuiteOn(
  platform: 'ios' | 'android',
  config: FlowConfig,
  flows: readonly string[],
): Promise<SmokeResult[]> {
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
  }

  // Every fragment is resolved too, not just the suite members: `runFlow` reads
  // the file on disk, so an unresolved fragment would drive the UI by a literal
  // `{{nav:tabs.home}}`.
  //
  // The dev-client URL is only supplied to the flows that declare it, because
  // the resolver treats an undeclared override as an authoring mistake - which
  // it is, for a capture flow, and that check is worth keeping.
  const translate = await loadTranslator('ca');
  const clientUrl = devClientUrl(config.scheme, metro.port);
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
      results.push({ flow, platform, passed: exitCode === 0 });
    }
  } finally {
    await metro.stop();
  }
  return results;
}

export async function runSmokeSuite(platforms: readonly ('ios' | 'android')[]): Promise<boolean> {
  const config = await loadFlowConfig();
  const flows = suiteFlows(await readdir(suiteDir));
  if (flows.length === 0) {
    throw new Error(`No smoke flows in ${suiteDir}`);
  }

  const results: SmokeResult[] = [];
  for (const platform of platforms) {
    results.push(...(await runSuiteOn(platform, config, flows)));
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
  const platforms =
    requested === 'both' ? (['android', 'ios'] as const) : ([requested] as ('ios' | 'android')[]);
  if (!platforms.every((platform) => platform === 'ios' || platform === 'android')) {
    console.error('--platform must be ios, android or both (default: android)');
    process.exit(1);
  }
  try {
    process.exit((await runSmokeSuite(platforms)) ? 0 : 1);
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
