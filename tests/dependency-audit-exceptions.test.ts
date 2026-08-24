import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'bun:test';
import { validateAuditReport, type AuditReport } from '../scripts/verify-dependency-audit';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exceptionPath = join(repoRoot, 'security-audit-findings', 'dependency-audit-exceptions.json');

type AuditException = {
  issue: string;
  package: string;
  installedVersion: string;
  reviewBy: string;
  exposure: string;
  dependencyPath: string[];
  advisories: Array<{ id: string; url: string }>;
  remediation: {
    patch: string;
    regressionTest: string;
  };
  removalCondition: string;
};

const readException = (): AuditException =>
  JSON.parse(readFileSync(exceptionPath, 'utf8')) as AuditException;

test('bun audit contains only the approved image-size advisories', () => {
  const exception = readException();
  const approvedReport: AuditReport = {
    'image-size': exception.advisories.map(({ url }) => ({ url })),
  };
  const unexpectedReport: AuditReport = {
    ...approvedReport,
    'unexpected-package': [{ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
  };

  expect(() => validateAuditReport(approvedReport, exception)).not.toThrow();
  expect(() => validateAuditReport(unexpectedReport, exception)).toThrow(
    'Audit packages do not match',
  );
});

test('the approved exception is scoped, patched, and not expired', () => {
  const exception = readException();
  const packageEntry = fileURLToPath(import.meta.resolve('image-size'));
  const packageManifest = JSON.parse(
    readFileSync(join(dirname(packageEntry), '..', 'package.json'), 'utf8'),
  ) as { name: string; version: string };

  expect(exception.issue).toBe('RAPP-110');
  expect(packageManifest).toMatchObject({
    name: exception.package,
    version: exception.installedVersion,
  });
  expect(exception.exposure).toBe('build-time only');
  expect(exception.dependencyPath).toEqual([
    'apps/mobile',
    'expo@57.0.7',
    '@expo/cli@57.0.9',
    '@expo/metro@56.0.0',
    'metro@0.84.4',
    'image-size@1.2.1',
  ]);
  expect(exception.advisories).toEqual([
    {
      id: 'GHSA-5p2g-fcmc-qvqq',
      url: 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
    },
    {
      id: 'GHSA-w3rx-r6r6-pgpr',
      url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
    },
  ]);
  expect(new Date(`${exception.reviewBy}T23:59:59Z`).getTime()).toBeGreaterThanOrEqual(Date.now());
  expect(exception.removalCondition.length).toBeGreaterThan(20);
  expect(readFileSync(join(repoRoot, exception.remediation.patch), 'utf8')).toContain(
    'jxlpBox.size < 12',
  );
  expect(readFileSync(join(repoRoot, exception.remediation.regressionTest), 'utf8')).toContain(
    'patched ICNS parser',
  );
});
