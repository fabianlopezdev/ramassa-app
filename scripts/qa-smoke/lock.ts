/**
 * One QA run at a time on this Mac (RAPP-500).
 *
 * The QA Supabase stack and the QA simulators are shared by every checkout of
 * this repo, so two runs at once would reset each other's database and drive
 * each other's devices. A second run waits for the first, and says whose run it
 * is waiting for. A lock whose process is gone is taken over.
 */

import { open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { log } from '../flow-capture/shell';
import { onInterrupt } from './cleanup';

const lockPath = path.join(tmpdir(), 'ramassa-qa-smoke.lock');

interface LockOwner {
  readonly pid: number;
  readonly cwd: string;
  readonly startedAt: string;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readOwner(): Promise<LockOwner | undefined> {
  try {
    return (await Bun.file(lockPath).json()) as LockOwner;
  } catch {
    return undefined;
  }
}

/** Waits for the lock and returns its release. */
export async function acquireQaLock(cwd: string): Promise<() => Promise<void>> {
  let announced = false;
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx');
      const owner: LockOwner = { pid: process.pid, cwd, startedAt: new Date().toISOString() };
      await handle.writeFile(JSON.stringify(owner));
      await handle.close();
      const release = async (): Promise<void> => {
        const current = await readOwner();
        if (current?.pid === process.pid) await rm(lockPath, { force: true });
      };
      const unregister = onInterrupt(release);
      return async () => {
        unregister();
        await release();
      };
    } catch {
      const owner = await readOwner();
      if (owner === undefined || !isAlive(owner.pid)) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (!announced) {
        log(
          `· another QA run holds the QA stack and simulators (pid ${owner.pid}, ${owner.cwd}, ` +
            `since ${owner.startedAt}); waiting for it`,
        );
        announced = true;
      }
      await Bun.sleep(10_000);
    }
  }
}
