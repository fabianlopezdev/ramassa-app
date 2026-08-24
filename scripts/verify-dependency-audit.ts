import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type AuditAdvisory = {
  url: string;
};

export type AuditReport = Record<string, AuditAdvisory[]>;

export type AuditException = {
  issue: string;
  package: string;
  installedVersion: string;
  reviewBy: string;
  advisories: Array<{ id: string; url: string }>;
};

export const advisoryIds = (report: AuditReport): string[] =>
  Object.values(report)
    .flat()
    .map(({ url }) => url.split('/').at(-1) ?? '')
    .sort();

export const validateAuditReport = (report: AuditReport, exception: AuditException): void => {
  const packages = Object.keys(report).sort();
  const actual = advisoryIds(report);
  const approved = exception.advisories.map(({ id }) => id).sort();

  if (JSON.stringify(packages) !== JSON.stringify([exception.package])) {
    throw new Error(
      `Audit packages do not match the ${exception.issue} exception: ${packages.join(', ') || 'none'}`,
    );
  }
  if (JSON.stringify(actual) !== JSON.stringify(approved)) {
    throw new Error(
      `Audit advisories do not match the ${exception.issue} exception: ${actual.join(', ') || 'none'}`,
    );
  }
  if (new Date(`${exception.reviewBy}T23:59:59Z`).getTime() < Date.now()) {
    throw new Error(
      `${exception.issue} dependency audit exception expired on ${exception.reviewBy}`,
    );
  }
};

if (import.meta.main) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const exception = JSON.parse(
    readFileSync(
      join(repoRoot, 'security-audit-findings', 'dependency-audit-exceptions.json'),
      'utf8',
    ),
  ) as AuditException;
  const audit = Bun.spawnSync(['bun', 'audit', '--json'], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (audit.exitCode !== 1 || audit.stdout.length === 0) {
    throw new Error(
      `bun audit did not return the expected advisory report: ${audit.stderr.toString()}`,
    );
  }

  const report = JSON.parse(audit.stdout.toString()) as AuditReport;
  validateAuditReport(report, exception);
  console.log(
    `Dependency audit matches ${exception.issue}; exception review due ${exception.reviewBy}.`,
  );
}
