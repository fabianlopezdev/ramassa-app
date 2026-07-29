/**
 * The two servers a capture needs, started only when they are not already there
 * and stopped again only if this run started them (RAPP-78).
 *
 * Metro, because the installed build is a dev client and its JS comes over the
 * wire. A static file server, because the player web pass is captured from a
 * real `expo export` bundle rather than from the dev server: the exported bundle
 * is what a player would load, and it has no dev overlay to keep out of a shot.
 */

import path from 'node:path';
import { repoRoot } from './config';
import { log, runOrThrow, waitFor } from './shell';

const mobileDir = path.join(repoRoot, 'apps', 'mobile');

export interface StoppableServer {
  stop(): Promise<void>;
}

/** A Metro this run can use, and the port it actually ended up on. */
export interface MetroServer extends StoppableServer {
  readonly port: number;
}

/**
 * Metro for THIS app, on the preferred port when that port is free or already
 * ours, and on the next free port when it is not.
 *
 * The identity check is the whole point. A dev client fetches its JS from
 * whatever server the deep link names, and it will happily run another app's
 * bundle inside this app's native binary: the JS loads, then the first native
 * module whose JS and `.so` halves disagree aborts the process. That is what
 * `react-native-worklets` did here, as a bare `jsi::Value::getString` assertion
 * with no mention of a bundle anywhere in it, after this machine's OTHER
 * project happened to claim 8081 first. A liveness probe cannot catch it,
 * because the wrong server is alive.
 */
export async function ensureMetro(port: number, scheme: string): Promise<MetroServer> {
  // Upward from the preferred port: ours is reused wherever it turns out to be,
  // another app's is stepped over, and the first genuinely empty port is where
  // this run starts its own.
  let ourPort = port;
  for (let candidate = port; candidate < port + 20; candidate += 1) {
    const owner = await metroScheme(candidate);
    if (owner === scheme) {
      log(`· reusing the Metro server already on :${candidate}`);
      return { port: candidate, stop: async () => {} };
    }
    if (owner !== undefined) {
      log(`· :${candidate} belongs to another app (${owner}), leaving it alone`);
      continue;
    }
    if (await isPortFree(candidate)) {
      ourPort = candidate;
      break;
    }
  }

  log(`· starting Metro on :${ourPort}`);
  const child = Bun.spawn(['bunx', 'expo', 'start', '--port', String(ourPort)], {
    cwd: mobileDir,
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
  });
  await waitFor(`Metro on :${ourPort}`, async () => (await metroScheme(ourPort)) === scheme, {
    timeoutMs: 180_000,
  });
  return {
    port: ourPort,
    stop: async () => {
      child.kill();
      await child.exited;
    },
  };
}

/**
 * The `scheme` of the app being served on a port, or undefined when nothing is
 * listening. Read from the Expo manifest rather than from `/status`, which
 * every Metro answers identically.
 */
async function metroScheme(port: number): Promise<string | undefined> {
  try {
    const response = await fetch(`http://localhost:${port}/`, {
      headers: { 'expo-platform': 'android', accept: 'application/expo+json,application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return undefined;
    const manifest = (await response.json()) as {
      extra?: { expoClient?: { scheme?: string | readonly string[] } };
    };
    const served = manifest.extra?.expoClient?.scheme;
    return Array.isArray(served) ? served[0] : (served as string | undefined);
  } catch {
    return undefined;
  }
}

async function isPortFree(port: number): Promise<boolean> {
  try {
    const probe = Bun.serve({ port, fetch: () => new Response() });
    await probe.stop(true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Exports the player app for the browser and serves the result. The export is
 * a single-page bundle, so anything that is not a real file falls back to
 * index.html and the router resolves the route client-side.
 */
export async function serveWebExport(port: number): Promise<StoppableServer> {
  log('· exporting the player app for the browser');
  // `--clear` is not optional here. Expo inlines EXPO_PUBLIC_* at transform time
  // and Metro caches the transform by file content, not by env, so a warm cache
  // happily bakes whatever backend URL the PREVIOUS export saw. That produced a
  // bundle pointing at a placeholder host while `.env` said localhost, and the
  // only symptom was a login that failed as "wrong password".
  await runOrThrow(['bunx', 'expo', 'export', '--platform', 'web', '--clear'], {
    cwd: mobileDir,
    inherit: true,
  });

  const distDir = path.join(mobileDir, 'dist');
  const indexHtml = Bun.file(path.join(distDir, 'index.html'));
  if (!(await indexHtml.exists())) {
    throw new Error(`expo export produced no index.html in ${distDir}`);
  }

  const server = Bun.serve({
    port,
    fetch: async (request) => {
      const { pathname } = new URL(request.url);
      const asset = Bun.file(path.join(distDir, decodeURIComponent(pathname)));
      if (pathname !== '/' && (await asset.exists())) {
        return new Response(asset);
      }
      return new Response(indexHtml, { headers: { 'content-type': 'text/html' } });
    },
  });
  log(`· serving the web export on ${server.url.origin}`);
  return {
    stop: async () => {
      await server.stop(true);
    },
  };
}

/**
 * Loopback, plus the RFC1918 ranges: the dev stack is reached over the LAN so a
 * real handset can talk to it, and that address is still unambiguously not
 * production (the hosted project lives on a public `supabase.co` host).
 */
const PRIVATE_HOST =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:|\/|$)/;

/**
 * Refuses to capture against anything but the local stack. The canvas is shown
 * to the client and attached to funder reporting; real participant data must
 * never reach it, and seeded data is also the only reason two runs of the same
 * flow produce the same screens (repo rule 9).
 */
export function assertLocalSupabase(): void {
  // bun loads the repo's .env before the script runs, which is the same file the
  // installed dev build was bundled against.
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  if (url === '') {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL is unset; start the local stack with `supabase start`.',
    );
  }
  if (!PRIVATE_HOST.test(url)) {
    throw new Error(
      `Refusing to capture against a non-local backend (${url}).\n` +
        '  Captures run against the local seeded stack only, never production.',
    );
  }
}
