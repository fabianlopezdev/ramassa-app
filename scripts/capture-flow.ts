/**
 * One-command flow capture (RAPP-78).
 *
 *   bun run capture:flow <slug> [--locale ca|ar] [--platform ios|android|both|web]
 *
 * Every user-facing flow in this product is screenshot-captured as it is built
 * and assembled into one pan/zoom canvas in the vault. The expensive part of a
 * capture is authoring the Maestro flow and the manifest graph, and that happens
 * once, in the issue that builds the screen. The REPEATABLE part happens again
 * at every phase closure, after the perfection sweep has changed the UI. This
 * script is what makes the repeatable part free: boot the device, run the flow,
 * curate the shots into the vault, upsert the canvas.
 *
 * A bare invocation on a player flow runs THREE passes (iOS, Android, and the
 * player web export), because the player app also ships in a browser and the
 * whole point of shooting both is catching a control that is fine full-width on
 * a phone and stretched on a desktop. `--platform` narrows it.
 *
 * Everything runs against the local seeded stack. Never production: the canvas
 * is shown to the client and attached to funder reporting.
 */

import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  expandHome,
  findFlow,
  loadFlowConfig,
  localeSuffix,
  repoRoot,
  resolvePasses,
  type FlowConfig,
  type FlowEntry,
  type Locale,
  type Pass,
  type PlatformFlag,
} from './flow-capture/config';
import {
  ensureAndroidApp,
  ensureAndroidDevice,
  ensureIosApp,
  ensureIosDevice,
  pinAndroidStatusBar,
  pinIosStatusBar,
  reverseMetroPort,
} from './flow-capture/devices';
import { assertClientSafe, resolveManifest, type FlowManifest } from './flow-capture/manifest';
import { devClientUrl, withFixtures, writeResolvedFlow } from './flow-capture/resolve-flow';
import {
  assertLocalSupabase,
  ensureMetro,
  serveWebExport,
  type StoppableServer,
} from './flow-capture/servers';
import { log, runOrThrow } from './flow-capture/shell';
import { interpolate, loadTranslator, type Translator } from './flow-capture/translations';

export interface CaptureOptions {
  readonly locale: Locale;
  readonly platform?: PlatformFlag;
}

export async function captureFlow(slug: string, options: CaptureOptions): Promise<void> {
  const config = await loadFlowConfig();
  const entry = findFlow(config, slug);
  const authored = await loadAuthoredManifest(slug);
  assertClientSafe(authored, `flows/${slug}.manifest.json`);
  assertLocalSupabase();

  const passes = resolvePasses(entry.surface, options.platform);
  const vaultFlowsDir = expandHome(config.vaultFlowsDir);
  const translate = await loadTranslator(options.locale);
  log(`\n▸ ${entry.title} (${slug}) — ${passes.join(', ')} · locale ${options.locale}`);

  for (const pass of passes) {
    await runPass(pass, { config, entry, options, vaultFlowsDir, translate });
  }

  await pruneUnreferenced(path.join(vaultFlowsDir, slug), authored);
  await upsertCanvas({ config, slug, authored, vaultFlowsDir });
}

async function runPass(
  pass: Pass,
  context: {
    config: FlowConfig;
    entry: FlowEntry;
    options: CaptureOptions;
    vaultFlowsDir: string;
    translate: Translator;
  },
): Promise<void> {
  const { config, entry, options, vaultFlowsDir, translate } = context;
  const destination = path.join(vaultFlowsDir, entry.slug, pass);
  await mkdir(destination, { recursive: true });

  if (pass === 'web') {
    await captureWebPass(config, entry, options, path.join(vaultFlowsDir, entry.slug), translate);
    return;
  }
  await captureMobilePass(pass, config, entry, options, destination, translate);
}

/**
 * The phone pass. The installed build is a dev client, so it is launched by deep
 * link at the Metro URL this run owns rather than with a plain `launchApp`,
 * which lands on the dev launcher's "searching for development servers" screen.
 */
async function captureMobilePass(
  pass: 'ios' | 'android',
  config: FlowConfig,
  entry: FlowEntry,
  options: CaptureOptions,
  destination: string,
  translate: Translator,
): Promise<void> {
  const flowFile = path.join(repoRoot, 'maestro', 'flows', `${entry.slug}.yaml`);
  if (!(await Bun.file(flowFile).exists())) {
    throw new Error(
      `No Maestro flow at maestro/flows/${entry.slug}.yaml. ` +
        'The issue that builds the screens authors it; this script only re-runs it.',
    );
  }
  const device =
    pass === 'ios'
      ? await ensureIosDevice(config.devices.ios)
      : await ensureAndroidDevice(config.devices.android);
  if (pass === 'ios') {
    await ensureIosApp(device, config.appId);
    await pinIosStatusBar(device);
  } else {
    await ensureAndroidApp(device, config.appId);
    await pinAndroidStatusBar(device);
  }

  const metro = await ensureMetro(config.metroPort, config.scheme);
  if (pass === 'android') {
    await reverseMetroPort(device, metro.port);
  }
  const shotsDir = path.join('maestro', 'shots', entry.slug, options.locale, pass);
  await rm(path.join(repoRoot, shotsDir), { recursive: true, force: true });
  await mkdir(path.join(repoRoot, shotsDir), { recursive: true });

  const resolvedFlowFile = await writeResolvedFlow(flowFile, translate, {
    SHOTS: shotsDir,
    SUFFIX: localeSuffix(options.locale),
    LOCALE: options.locale,
    DEV_CLIENT_URL: devClientUrl(config.scheme, metro.port),
  });

  try {
    log(`· running ${entry.slug} on ${pass} (${device})`);
    await runOrThrow(['maestro', '--device', device, 'test', resolvedFlowFile], {
      cwd: repoRoot,
      inherit: true,
    });
  } finally {
    await metro.stop();
  }

  await curate(path.join(repoRoot, shotsDir), destination);
}

/**
 * The browser pass, delegated to the flow-shots web harness. The committed spec
 * carries no machine-specific paths, so the run resolves the origin and the
 * output directory here and hands the harness a spec with the locale (and, for a
 * non-default locale, the filename suffix) folded in.
 */
const BROWSER_LOCALES: Record<Locale, string> = { ca: 'ca-ES', ar: 'ar-MA' };

async function captureWebPass(
  config: FlowConfig,
  entry: FlowEntry,
  options: CaptureOptions,
  destination: string,
  translate: Translator,
): Promise<void> {
  const specFile = path.join(repoRoot, 'maestro', 'web', `${entry.slug}.web.json`);
  if (!(await Bun.file(specFile).exists())) {
    throw new Error(
      `No browser spec at maestro/web/${entry.slug}.web.json. ` +
        'Every player flow is captured on a phone AND in a desktop browser.',
    );
  }

  const spec = interpolate(
    (await Bun.file(specFile).json()) as { steps: { label: string }[] },
    withFixtures(translate),
  );
  const suffix = localeSuffix(options.locale);
  const resolvedSpec = {
    ...spec,
    locale: BROWSER_LOCALES[options.locale],
    steps: spec.steps.map((step) => ({ ...step, label: `${step.label}${suffix}` })),
  };
  const resolvedSpecFile = path.join(
    repoRoot,
    '.flow-shots',
    `${entry.slug}.${options.locale}.json`,
  );
  await mkdir(path.dirname(resolvedSpecFile), { recursive: true });
  await Bun.write(resolvedSpecFile, `${JSON.stringify(resolvedSpec, null, 2)}\n`);

  const preview: StoppableServer = await serveWebExport(config.webPreviewPort);
  try {
    await runOrThrow(
      [
        'node',
        path.join(expandHome(config.flowShotsSkillDir), 'scripts', 'capture-web.mjs'),
        '--spec',
        resolvedSpecFile,
        '--base-url',
        `http://localhost:${config.webPreviewPort}`,
        '--out',
        destination,
      ],
      { cwd: repoRoot, inherit: true },
    );
  } finally {
    await preview.stop();
  }
}

/**
 * Deletes screenshots the manifest no longer points at: the browser pass shoots
 * its own sign-in steps to get past the auth gate, and a renamed step leaves its
 * old file behind. Both would otherwise sit in a client-facing folder forever.
 */
async function pruneUnreferenced(flowDir: string, authored: FlowManifest): Promise<void> {
  const referenced = new Set(
    authored.steps.flatMap((step) =>
      [step.ios, step.android, step.web].filter((value): value is string => value !== undefined),
    ),
  );
  const slug = path.basename(flowDir);
  for (const pass of ['ios', 'android', 'web'] as const) {
    const dir = path.join(flowDir, pass);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files.filter((name) => name.endsWith('.png'))) {
      if (!referenced.has(`${slug}/${pass}/${file}`)) {
        await rm(path.join(dir, file));
        log(`· pruned ${pass}/${file} (no step points at it)`);
      }
    }
  }
}

/** Scratch shots live in the repo and are gitignored; the vault holds the keepers. */
async function curate(shotsDir: string, destination: string): Promise<void> {
  const files = (await readdir(shotsDir)).filter((file) => file.endsWith('.png')).sort();
  if (files.length === 0) {
    throw new Error(`The flow ran but wrote no screenshots to ${shotsDir}`);
  }
  for (const file of files) {
    await Bun.write(path.join(destination, file), Bun.file(path.join(shotsDir, file)));
  }
  log(`· curated ${files.length} screen(s) → ${destination}`);
}

/**
 * Writes the resolved manifest next to the images and upserts this one flow into
 * the shared canvas. Re-running replaces this flow's images and leaves every
 * other flow, and any hand-tuned layout in the state sidecar, untouched.
 */
async function upsertCanvas(context: {
  config: FlowConfig;
  slug: string;
  authored: FlowManifest;
  vaultFlowsDir: string;
}): Promise<void> {
  const { config, slug, authored, vaultFlowsDir } = context;
  const resolved = resolveManifest(
    authored,
    (relativePath) => Bun.file(path.join(vaultFlowsDir, relativePath)).size > 0,
    new Date().toISOString().slice(0, 10),
  );
  if (resolved.steps.length === 0) {
    throw new Error(`No captured screens found for "${slug}"; refusing to upsert an empty flow.`);
  }
  assertClientSafe(resolved, `the resolved manifest for ${slug}`);

  const manifestFile = path.join(vaultFlowsDir, `${slug}.manifest.json`);
  await Bun.write(manifestFile, `${JSON.stringify(resolved, null, 2)}\n`);

  await runOrThrow(
    [
      'node',
      path.join(expandHome(config.flowShotsSkillDir), 'scripts', 'build-canvas.mjs'),
      '--canvas',
      path.join(vaultFlowsDir, config.canvas),
      '--manifest',
      manifestFile,
      '--app',
      config.app,
    ],
    { cwd: repoRoot, inherit: true },
  );
}

async function loadAuthoredManifest(slug: string): Promise<FlowManifest> {
  const file = Bun.file(path.join(repoRoot, 'flows', `${slug}.manifest.json`));
  if (!(await file.exists())) {
    throw new Error(
      `No manifest at flows/${slug}.manifest.json. It declares the steps and the graph, ` +
        'and is authored by the issue that builds the flow.',
    );
  }
  return (await file.json()) as FlowManifest;
}

export function parseCaptureOptions(argv: readonly string[]): CaptureOptions {
  const locale = valueOf(argv, '--locale') ?? 'ca';
  if (locale !== 'ca' && locale !== 'ar') {
    throw new Error(`--locale must be ca or ar (got "${locale}")`);
  }
  const platform = valueOf(argv, '--platform');
  if (
    platform !== undefined &&
    platform !== 'ios' &&
    platform !== 'android' &&
    platform !== 'both' &&
    platform !== 'web'
  ) {
    throw new Error(`--platform must be ios, android, both or web (got "${platform}")`);
  }
  return { locale, ...(platform === undefined ? {} : { platform }) };
}

function valueOf(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const slug = argv[0];
  if (slug === undefined || slug.startsWith('--')) {
    console.error(
      'Usage: bun run capture:flow <slug> [--locale ca|ar] [--platform ios|android|both|web]',
    );
    process.exit(1);
  }
  try {
    await captureFlow(slug, parseCaptureOptions(argv));
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
