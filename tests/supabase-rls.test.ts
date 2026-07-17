/**
 * Bridges the pgTAP RLS + encryption suite (supabase/tests/*.sql) into `bun test`.
 *
 * The real assertions live in SQL and run inside Postgres via `supabase test db`;
 * this test shells out and asserts the run passes. It requires the local Supabase
 * stack (Docker) to be up, so it SKIPS, rather than fails, when the stack is not
 * reachable. That keeps `bun test` green in CI (no Docker) and for anyone who has
 * not run `bunx supabase start`, while still gating the SQL layer locally.
 *
 * To exercise it: `bunx supabase start` then `bun test`.
 */

import { spawnSync } from 'node:child_process';
import { expect, test } from 'bun:test';

const localApiUrl = 'http://127.0.0.1:54321/rest/v1/';

async function isLocalStackReachable(): Promise<boolean> {
  try {
    await fetch(localApiUrl, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

const stackUp = await isLocalStackReachable();

test.skipIf(!stackUp)(
  'pgTAP RLS + encryption suite passes (supabase test db)',
  () => {
    // `supabase test db` exits 0 only when every pgTAP assertion passes and 1 when
    // any fails (verified), so the exit status is the source of truth. We do not
    // parse stdout: bun's spawnSync does not reliably capture the child CLI's
    // output, but the exit code is always correct.
    const result = spawnSync('supabase', ['test', 'db'], {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      console.error('supabase test db failed:', {
        status: result.status,
        error: result.error?.message,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
      });
    }
    expect(result.status).toBe(0);
  },
  120_000,
);

test.skipIf(stackUp)('pgTAP suite skipped: local Supabase stack not running', () => {
  // Placeholder so the file always reports a result; run `bunx supabase start`
  // and re-run `bun test` to execute the real suite above.
  expect(stackUp).toBe(false);
});
