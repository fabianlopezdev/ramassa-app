/**
 * The closure gate's capture pass (RAPP-78).
 *
 *   bun run capture:phase <n>        # 1..9; a bare 5 covers both 5a and 5b
 *
 * A phase closes with a perfection sweep that changes the UI, which stales every
 * screenshot taken before it. This re-shoots every flow that phase owns in one
 * invocation so the canvas matches what actually shipped.
 *
 * Flows whose Maestro flow or manifest does not exist yet are reported and
 * skipped rather than failing the run: a phase closing early in the build has
 * flows that later phases will author, and a silent skip would read as coverage
 * that is not there.
 */

import path from 'node:path';
import { captureFlow, parseCaptureOptions } from './capture-flow';
import { flowsForPhase, loadFlowConfig, repoRoot } from './flow-capture/config';

export async function capturePhase(
  phase: string,
  options: ReturnType<typeof parseCaptureOptions>,
): Promise<void> {
  const config = await loadFlowConfig();
  const flows = flowsForPhase(config, phase);
  if (flows.length === 0) {
    throw new Error(`No flows are assigned to phase "${phase}".`);
  }

  const captured: string[] = [];
  const skipped: string[] = [];
  for (const flow of flows) {
    if (!(await Bun.file(path.join(repoRoot, 'flows', `${flow.slug}.manifest.json`)).exists())) {
      skipped.push(flow.slug);
      continue;
    }
    await captureFlow(flow.slug, options);
    captured.push(flow.slug);
  }

  console.log(`\n✓ phase ${phase}: captured ${captured.length}/${flows.length} flow(s)`);
  if (skipped.length > 0) {
    console.log(`  not authored yet, skipped: ${skipped.join(', ')}`);
  }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const phase = argv[0];
  if (phase === undefined || phase.startsWith('--')) {
    console.error(
      'Usage: bun run capture:phase <n> [--locale ca|ar] [--platform ios|android|both|web]',
    );
    process.exit(1);
  }
  try {
    await capturePhase(phase, parseCaptureOptions(argv));
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
