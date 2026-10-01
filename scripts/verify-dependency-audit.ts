import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const validateAuditReport = (report: unknown): void => {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Invalid dependency audit report');
  }
  const packages = Object.keys(report);
  if (packages.length > 0) {
    throw new Error(`Dependency audit found advisories: ${packages.join(', ')}`);
  }
};

if (import.meta.main) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const audit = Bun.spawnSync(['bun', 'audit', '--json'], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (audit.exitCode !== 0 || audit.stdout.length === 0) {
    throw new Error(
      `Dependency audit failed: ${audit.stdout.toString()}${audit.stderr.toString()}`,
    );
  }
  validateAuditReport(JSON.parse(audit.stdout.toString()));
  console.log('Dependency audit passed with no advisories or exceptions.');
}
