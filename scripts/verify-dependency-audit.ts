import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The dependency audit gate (RAPP-110, RAPP-125, RAPP-220).
 *
 * Every advisory fails the gate unless an exception names that exact advisory
 * id for that exact package. An exception is a dated, evidenced record for an
 * advisory with no patched release upstream. It lasts at most 31 days, and it
 * fails the gate once it expires or once the advisory is no longer reported,
 * so a fix that ships upstream is picked up instead of silently ignored.
 */

export type AuditException = {
  issue: string;
  package: string;
  installedVersion: string;
  created: string;
  reviewBy: string;
  exposure: string;
  dependencyPath: string[];
  reachableSurface: string;
  advisories: Array<{ id: string; url: string }>;
  upstreamStatus: string;
  removalCondition: string;
};

const MAX_EXCEPTION_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

const advisoryId = (advisory: unknown): string => {
  const url =
    advisory !== null && typeof advisory === 'object' && 'url' in advisory
      ? String(advisory.url)
      : '';
  return url.split('/').at(-1) ?? '';
};

const isFilled = (value: unknown): boolean =>
  typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) && value.length > 0;

const assertExceptionShape = (exception: AuditException): void => {
  const required: Array<keyof AuditException> = [
    'issue',
    'package',
    'installedVersion',
    'created',
    'reviewBy',
    'exposure',
    'dependencyPath',
    'reachableSurface',
    'advisories',
    'upstreamStatus',
    'removalCondition',
  ];
  const missing = required.filter((field) => !isFilled(exception[field]));
  if (missing.length > 0) {
    throw new Error(
      `Invalid dependency audit exception for ${exception.package || 'unknown package'}: missing ${missing.join(', ')}`,
    );
  }
};

export const validateAuditReport = (
  report: unknown,
  exceptions: readonly AuditException[] = [],
  now: number = Date.now(),
): void => {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Invalid dependency audit report');
  }

  for (const exception of exceptions) {
    assertExceptionShape(exception);
    const created = Date.parse(`${exception.created}T00:00:00Z`);
    const reviewBy = Date.parse(`${exception.reviewBy}T23:59:59Z`);
    if ((reviewBy - created) / DAY_MS > MAX_EXCEPTION_DAYS) {
      throw new Error(
        `${exception.issue} exception for ${exception.package} is longer than ${MAX_EXCEPTION_DAYS} days`,
      );
    }
    if (reviewBy < now) {
      throw new Error(
        `${exception.issue} exception for ${exception.package} expired on ${exception.reviewBy}`,
      );
    }
  }

  const reported = report as Record<string, unknown>;
  const unexcepted: string[] = [];
  for (const [name, advisories] of Object.entries(reported)) {
    const approved = new Set(
      exceptions.filter((e) => e.package === name).flatMap((e) => e.advisories.map((a) => a.id)),
    );
    const ids = Array.isArray(advisories) ? advisories.map(advisoryId) : [];
    if (ids.length === 0 || approved.size === 0) {
      unexcepted.push(name);
      continue;
    }
    for (const id of ids) {
      if (!approved.has(id)) unexcepted.push(`${name} (${id})`);
    }
  }
  if (unexcepted.length > 0) {
    throw new Error(`Dependency audit found advisories: ${unexcepted.join(', ')}`);
  }

  for (const exception of exceptions) {
    const ids = new Set(
      Array.isArray(reported[exception.package])
        ? (reported[exception.package] as unknown[]).map(advisoryId)
        : [],
    );
    const stale = exception.advisories.filter((a) => !ids.has(a.id)).map((a) => a.id);
    if (stale.length > 0) {
      throw new Error(
        `${exception.issue} exception for ${exception.package} lists advisories no longer reported (${stale.join(', ')}); remove it`,
      );
    }
  }
};

if (import.meta.main) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const exceptions = JSON.parse(
    readFileSync(
      join(repoRoot, 'security-audit-findings', 'dependency-audit-exceptions.json'),
      'utf8',
    ),
  ) as AuditException[];
  const audit = Bun.spawnSync(['bun', 'audit', '--json'], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  // bun audit exits 0 with an empty report and 1 when it reports advisories.
  // Anything else (a crash, no output) fails closed.
  if (![0, 1].includes(audit.exitCode ?? -1) || audit.stdout.length === 0) {
    throw new Error(
      `Dependency audit failed: ${audit.stdout.toString()}${audit.stderr.toString()}`,
    );
  }
  validateAuditReport(JSON.parse(audit.stdout.toString()), exceptions);
  console.log(
    exceptions.length === 0
      ? 'Dependency audit passed with no advisories or exceptions.'
      : `Dependency audit passed; exceptions: ${exceptions.map((e) => `${e.package} (${e.issue}, review by ${e.reviewBy})`).join(', ')}.`,
  );
}
