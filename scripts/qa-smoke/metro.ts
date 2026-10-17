/**
 * The QA run's own Metro (RAPP-500).
 *
 * Never a Metro someone else started. Expo inlines `EXPO_PUBLIC_*` into the
 * bundle, so the Metro decides which database the app talks to: reusing a dev
 * Metro would run the suite against the shared dev stack, and it would also
 * test whatever checkout that Metro was started from.
 *
 * The transform cache lives in its own folder, keyed by the backend values.
 * Metro caches transforms by file content and not by env, so a shared cache
 * could bake the dev URL into a QA bundle (or the QA URL into a dev bundle).
 */

import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repoRoot } from '../flow-capture/config';
import { isPortFree, metroSchemes, type MetroServer } from '../flow-capture/servers';
import { log, waitFor } from '../flow-capture/shell';
import { onInterrupt } from './cleanup';

const mobileDir = path.join(repoRoot, 'apps', 'mobile');

export async function startQaMetro(
  firstPort: number,
  scheme: string,
  backend: Readonly<Record<string, string>>,
): Promise<MetroServer> {
  let port: number | undefined;
  for (let candidate = firstPort; candidate < firstPort + 30; candidate += 1) {
    if ((await metroSchemes(candidate)) === undefined && (await isPortFree(candidate))) {
      port = candidate;
      break;
    }
  }
  if (port === undefined) throw new Error(`No free port for the QA Metro from :${firstPort}`);
  const metroPort = port;

  const cacheKey = createHash('sha256')
    .update(repoRoot)
    .update(JSON.stringify(Object.entries(backend).sort()))
    .digest('hex')
    .slice(0, 12);
  const cacheRoot = path.join(tmpdir(), 'ramassa-qa-metro', cacheKey);
  await mkdir(cacheRoot, { recursive: true });

  log(`· starting the QA Metro on :${port}`);
  const child = Bun.spawn(['bunx', 'expo', 'start', '--port', String(port)], {
    cwd: mobileDir,
    env: { ...process.env, ...backend, TMPDIR: cacheRoot, EXPO_NO_TELEMETRY: '1' },
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
  });
  const unregister = onInterrupt(() => {
    child.kill();
  });
  const stop = async (): Promise<void> => {
    unregister();
    child.kill();
    await child.exited;
  };
  try {
    await waitFor(
      `the QA Metro on :${metroPort}`,
      async () => (await metroSchemes(metroPort))?.includes(scheme) === true,
      { timeoutMs: 180_000 },
    );
  } catch (error) {
    await stop();
    throw error;
  }
  return { port: metroPort, stop };
}

/**
 * Builds the iOS or Android bundle once, before any device asks for it. Every
 * device then gets it from memory instead of each one waiting on (and timing
 * out behind) the same cold transform.
 */
export async function prewarmBundle(port: number, platform: 'ios' | 'android'): Promise<void> {
  const started = Date.now();
  const manifest = (await (
    await fetch(`http://localhost:${port}/`, {
      headers: { 'expo-platform': platform, accept: 'application/expo+json,application/json' },
    })
  ).json()) as { launchAsset?: { url?: string } };
  const url = manifest.launchAsset?.url;
  if (url === undefined) return;
  const response = await fetch(url.replace(/^http:\/\/[^/]+/, `http://localhost:${port}`), {
    signal: AbortSignal.timeout(600_000),
  });
  await response.arrayBuffer();
  log(`· ${platform} bundle ready in ${Math.round((Date.now() - started) / 1000)}s`);
}
