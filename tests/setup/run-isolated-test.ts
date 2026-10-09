import { resolve } from 'node:path';
import { expect } from 'bun:test';

// Bun caches mocked module exports across files. Native suites need separate
// module registries so a prior screen's partial React Native mock cannot leak.
export function assertIsolatedTestPasses(path: string): void {
  const result = Bun.spawnSync([process.execPath, 'test', path], {
    cwd: resolve(import.meta.dir, '../..'),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Native suite failed: ${path}\n${result.stdout.toString()}${result.stderr.toString()}`,
    );
  }
  expect(result.exitCode).toBe(0);
}
