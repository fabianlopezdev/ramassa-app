/**
 * The flow-capture inventory and the pure decisions taken from it (RAPP-78).
 *
 * `flows/flows.json` is the single list of every user-facing flow in the
 * product, mirroring the inventory on the project page: one entry per slug,
 * carrying the phase that owns it and the surface it is captured on. Everything
 * in this module is a pure function over that file so the interesting decisions
 * (which passes a flow needs, which slugs a phase owns) are unit-testable
 * without a simulator, an emulator, or a browser attached.
 */

import { homedir } from 'node:os';
import path from 'node:path';

/** Where a flow lives in the product. Decides which engine captures it. */
export type Surface = 'mobile' | 'admin' | 'entity';

/** One capture pass: a device rendering, or the desktop browser. */
export type Pass = 'ios' | 'android' | 'web';

/** What `--platform` accepts. `both` means both phone renderings, no browser. */
export type PlatformFlag = 'ios' | 'android' | 'both' | 'web';

/** Capture locale. CA is the product default; AR is the RTL proof. */
export type Locale = 'ca' | 'ar';

export interface FlowEntry {
  readonly slug: string;
  /** Phase that owns the flow, as written on the roadmap ("1".."9", "5a", "5b"). */
  readonly phase: string;
  readonly surface: Surface;
  /** Client-facing name shown in the canvas toolbar. Never a ticket reference. */
  readonly title: string;
}

export interface FlowConfig {
  readonly app: string;
  readonly canvas: string;
  readonly vaultFlowsDir: string;
  readonly flowShotsSkillDir: string;
  readonly devices: { readonly ios: string; readonly android: string };
  readonly appId: string;
  readonly scheme: string;
  readonly metroPort: number;
  readonly webPreviewPort: number;
  readonly adminPreviewPort: number;
  readonly flows: readonly FlowEntry[];
}

/** Repo root, derived from this file's location rather than from the cwd. */
export const repoRoot = path.resolve(import.meta.dir, '..', '..');

/** `~/x` is not expanded by the shell when it arrives inside a JSON string. */
export function expandHome(target: string): string {
  return target.startsWith('~/') ? path.join(homedir(), target.slice(2)) : target;
}

export async function loadFlowConfig(
  configPath = path.join(repoRoot, 'flows', 'flows.json'),
): Promise<FlowConfig> {
  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    throw new Error(`Flow inventory not found at ${configPath}`);
  }
  return (await file.json()) as FlowConfig;
}

export function findFlow(config: FlowConfig, slug: string): FlowEntry {
  const entry = config.flows.find((flow) => flow.slug === slug);
  if (entry === undefined) {
    throw new Error(
      `Unknown flow "${slug}". Known slugs: ${config.flows.map((flow) => flow.slug).join(', ')}`,
    );
  }
  return entry;
}

/**
 * Which passes a bare `capture:flow <slug>` runs.
 *
 * A player flow means THREE passes, not one. Dispatching on surface alone would
 * only ever run Maestro for a mobile flow and leave the browser pass depending
 * on someone remembering the flag — and the player app ships as a web export
 * whose desktop layout deliberately differs, so the pass that catches a control
 * stretching on desktop is exactly the one that would get skipped.
 */
export function resolvePasses(surface: Surface, platform?: PlatformFlag): readonly Pass[] {
  if (surface !== 'mobile') {
    if (platform !== undefined && platform !== 'web') {
      throw new Error(
        `A "${surface}" flow is captured in a browser; --platform ${platform} does not apply.`,
      );
    }
    return ['web'];
  }
  switch (platform) {
    case undefined:
      return ['ios', 'android', 'web'];
    case 'both':
      return ['ios', 'android'];
    default:
      return [platform];
  }
}

/**
 * The slugs a closure gate has to capture. A bare phase number also claims its
 * lettered halves, so `capture:phase 5` covers both 5a and 5b without the caller
 * having to know the roadmap splits that phase in two.
 */
export function flowsForPhase(config: FlowConfig, phase: string): readonly FlowEntry[] {
  const wanted = phase.trim().toLowerCase();
  return config.flows.filter(
    (flow) => flow.phase === wanted || (/^\d+$/.test(wanted) && flow.phase.startsWith(wanted)),
  );
}

/** Filenames carry the locale so one flow folder holds both language passes. */
export function localeSuffix(locale: Locale): string {
  return locale === 'ca' ? '' : `-${locale}`;
}
