/**
 * Process plumbing shared by the capture harness (RAPP-78).
 *
 * Everything a capture shells out to (simctl, adb, maestro, expo, node) is run
 * through here so failures surface the real stderr rather than a bare exit code:
 * a build that dies on a pod, or a Maestro flow that could not match a label,
 * is only debuggable from its own output.
 */

export interface RunOptions {
  readonly cwd?: string;
  /** Stream child output straight to the terminal instead of capturing it. */
  readonly inherit?: boolean;
  readonly env?: Record<string, string>;
}

export interface RunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function run(
  command: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    env: options.env === undefined ? process.env : { ...process.env, ...options.env },
    stdout: options.inherit === true ? 'inherit' : 'pipe',
    stderr: options.inherit === true ? 'inherit' : 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    options.inherit === true ? Promise.resolve('') : new Response(child.stdout).text(),
    options.inherit === true ? Promise.resolve('') : new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  return { exitCode, stdout, stderr };
}

/** Same as `run`, but a non-zero exit is fatal and carries the child's output. */
export async function runOrThrow(
  command: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const result = await run(command, options);
  if (result.exitCode !== 0) {
    const detail = options.inherit === true ? '' : `\n${result.stdout}\n${result.stderr}`.trimEnd();
    throw new Error(`Command failed (exit ${result.exitCode}): ${command.join(' ')}${detail}`);
  }
  return result;
}

/** Polls `check` until it is true or the deadline passes. */
export async function waitFor(
  description: string,
  check: () => Promise<boolean>,
  { timeoutMs, intervalMs = 500 }: { timeoutMs: number; intervalMs?: number },
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${description}`,
      );
    }
    await Bun.sleep(intervalMs);
  }
}

export function log(message: string): void {
  console.log(message);
}
