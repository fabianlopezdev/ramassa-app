/**
 * One Maestro flow on one device, with a result that does not depend on the
 * Maestro process exiting (RAPP-500).
 *
 * Maestro 2.6 keeps only the six newest run folders in its log directory,
 * `<user.home>/Library/Logs/maestro`, and deletes the rest when a run starts.
 * With several Maestro processes on this Mac (ours in parallel, plus other
 * sessions'), one run deletes another's folder while it is still in use, and
 * the victim throws `NoSuchFileException` in `DebugLogStore.finalizeRun` and
 * then never exits. Two defences:
 *
 * 1. Each shard gets its own `user.home` (through `MAESTRO_OPTS`), so its log
 *    folder is private. `~/.maestro` is linked in, so settings and the driver
 *    cache stay shared. Subprocesses still see the real `HOME`.
 * 2. The result is read from the JUnit report and the `Flow Passed/Failed`
 *    summary line, which Maestro writes before it tidies its logs. Once either
 *    exists the process gets a short grace period and is then killed.
 *
 * With `--format junit` Maestro prints nothing to stdout until the flow ends,
 * so liveness is read from the debug `maestro.log` it writes as it goes. A run
 * whose log stops growing for `idleTimeoutMs` is killed and counted as failed.
 */

import { mkdir, rm, stat, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { onInterrupt } from './cleanup';

export interface MaestroFlowResult {
  readonly passed: boolean;
  readonly seconds: number;
  /** Why the run ended in a way other than a normal exit, when it did. */
  readonly note?: string;
  /** The failure message from the JUnit report, when the flow failed. */
  readonly failure?: string;
}

export interface MaestroFlowOptions {
  readonly device: string;
  readonly flowFile: string;
  readonly cwd: string;
  readonly debugOutputDir: string;
  /** Private `user.home` for this shard's Maestro processes. */
  readonly maestroHome: string;
  /**
   * iOS only. Maestro lists Android devices before every run, through the adb
   * server on `localhost:5037`, even for an iOS device, and an emulator that
   * stops answering `adb shell` (another session's, on this Mac) blocks that
   * listing forever. Preferring IPv6 makes `localhost` resolve to `::1`, where
   * the IPv4-only adb server is not listening, so the listing fails at once and
   * finds no Android devices. The iOS driver is addressed as 127.0.0.1 and is
   * unaffected.
   */
  readonly skipAdb?: boolean;
  /** Prefix for every streamed output line, e.g. `[ios 2]`. */
  readonly label: string;
  readonly idleTimeoutMs?: number;
  readonly totalTimeoutMs?: number;
  readonly exitGraceMs?: number;
}

/** The summary line Maestro prints once the flow is decided. */
export function summaryVerdict(line: string): boolean | undefined {
  const match = /(\d+)\/(\d+) Flows? (Passed|Failed)/.exec(line);
  if (match === null) return undefined;
  return match[3] === 'Passed' && match[1] === match[2];
}

/** The JUnit report's verdict: every test case SUCCESS and no failure counted. */
export function junitVerdict(xml: string): boolean | undefined {
  if (!xml.includes('<testsuite')) return undefined;
  const cases = [...xml.matchAll(/<testcase\b[^>]*\bstatus="([A-Z_]+)"/g)].map((m) => m[1]);
  if (cases.length === 0) return undefined;
  const failures = /<testsuite\b[^>]*\bfailures="(\d+)"/.exec(xml)?.[1];
  return (
    cases.every((status) => status === 'SUCCESS') && (failures === undefined || failures === '0')
  );
}

/**
 * Debug output per flow, so one flow's artifacts never overwrite another's, and
 * a JUnit report next to them, so the verdict does not depend on the exit code.
 */
export function maestroSmokeCommand(
  device: string,
  flowFile: string,
  debugOutputDir: string,
  reportPath: string,
): string[] {
  return [
    'maestro',
    '--device',
    device,
    'test',
    '--no-ansi',
    '--format',
    'junit',
    '--output',
    reportPath,
    '--debug-output',
    debugOutputDir,
    '--flatten-debug-output',
    flowFile,
  ];
}

/**
 * A failure of the device driver rather than of the app: XCUITest loses its
 * element handles while the app is re-rendering (`kAXErrorInvalidUIElement`,
 * reported by Maestro as "Unknown error"), or the driver connection drops.
 * Nothing in the app was asserted, so the flow is run once more. Assertion
 * failures are never retried.
 */
export function isDriverFailure(failure: string | undefined, note: string | undefined): boolean {
  if (note !== undefined) return true;
  return (
    failure !== undefined &&
    /^Unknown error$|kAXError|XCTestDriver|Connection refused/i.test(failure)
  );
}

export async function prepareMaestroHome(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const link = path.join(dir, '.maestro');
  await rm(link, { force: true, recursive: false }).catch(() => {});
  await symlink(path.join(homedir(), '.maestro'), link).catch(() => {});
}

export async function runMaestroFlow(options: MaestroFlowOptions): Promise<MaestroFlowResult> {
  const {
    device,
    flowFile,
    cwd,
    debugOutputDir,
    maestroHome,
    label,
    skipAdb = false,
    idleTimeoutMs = 8 * 60_000,
    totalTimeoutMs = 25 * 60_000,
    exitGraceMs = 20_000,
  } = options;

  await rm(debugOutputDir, { recursive: true, force: true });
  await mkdir(debugOutputDir, { recursive: true });
  const reportPath = path.join(debugOutputDir, 'report.xml');
  const logPath = path.join(debugOutputDir, 'maestro-output.log');
  const logWriter = Bun.file(logPath).writer();

  const started = Date.now();
  const child = Bun.spawn(maestroSmokeCommand(device, flowFile, debugOutputDir, reportPath), {
    cwd,
    env: {
      ...process.env,
      MAESTRO_OPTS: [
        process.env.MAESTRO_OPTS ?? '',
        `-Duser.home=${maestroHome}`,
        skipAdb ? '-Djava.net.preferIPv6Addresses=true' : '',
      ]
        .filter((option) => option !== '')
        .join(' '),
      MAESTRO_CLI_NO_ANALYTICS: '1',
      MAESTRO_DISABLE_UPDATE_CHECK: 'true',
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const unregister = onInterrupt(() => {
    child.kill('SIGKILL');
  });
  const debugLog = path.join(debugOutputDir, 'maestro.log');
  let lastOutput = Date.now();
  let lastLogSize = -1;
  let summary: boolean | undefined;
  let crashedAfterRun = false;

  const pump = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
    const decoder = new TextDecoder();
    let buffered = '';
    for await (const chunk of stream) {
      lastOutput = Date.now();
      const text = decoder.decode(chunk, { stream: true });
      logWriter.write(text);
      buffered += text;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        const verdict = summaryVerdict(line);
        if (verdict !== undefined) summary = verdict;
        if (line.includes('NoSuchFileException') || line.includes('DebugLogStore')) {
          crashedAfterRun = true;
        }
        if (line.trim() !== '') console.log(`${label} ${line}`);
      }
    }
    if (buffered.trim() !== '') console.log(`${label} ${buffered}`);
  };
  const pumps = Promise.all([pump(child.stdout), pump(child.stderr)]);

  let note: string | undefined;
  let decidedAt: number | undefined;
  const exited = child.exited.then(() => true);
  for (;;) {
    const done = await Promise.race([exited, Bun.sleep(2000).then(() => false)]);
    if (done) break;
    const now = Date.now();
    const logSize = await stat(debugLog).then(
      (info) => info.size,
      () => -1,
    );
    if (logSize !== lastLogSize) {
      lastLogSize = logSize;
      lastOutput = now;
    }
    const report = Bun.file(reportPath);
    const decided = summary !== undefined || (await report.exists());
    if (decided && decidedAt === undefined) decidedAt = now;
    if (decidedAt !== undefined && now - decidedAt > exitGraceMs) {
      note = crashedAfterRun
        ? 'Maestro crashed tidying its logs after the flow; result read from the report'
        : 'Maestro did not exit after the flow; result read from the report';
      child.kill('SIGKILL');
      break;
    }
    if (now - lastOutput > idleTimeoutMs) {
      note = `no progress for ${Math.round(idleTimeoutMs / 60_000)} min; killed`;
      child.kill('SIGKILL');
      break;
    }
    if (now - started > totalTimeoutMs) {
      note = `over ${Math.round(totalTimeoutMs / 60_000)} min; killed`;
      child.kill('SIGKILL');
      break;
    }
  }
  const exitCode = await child.exited;
  unregister();
  await Promise.race([pumps, Bun.sleep(3000)]);
  await logWriter.end();

  const report = Bun.file(reportPath);
  const reportXml = (await report.exists()) ? await report.text() : '';
  const fromReport = junitVerdict(reportXml);
  const failure = /<failure>([^<]*)/.exec(reportXml)?.[1]?.trim();
  const verdict = fromReport ?? summary;
  const passed = verdict ?? (note === undefined && exitCode === 0);
  return {
    passed,
    seconds: Math.round((Date.now() - started) / 1000),
    note,
    ...(passed || failure === undefined ? {} : { failure }),
  };
}
