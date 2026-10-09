import { expect, test } from 'bun:test';
import { validateAuditReport, type AuditException } from '../scripts/verify-dependency-audit';

const now = Date.parse('2026-10-09T12:00:00Z');

const braces = (overrides: Partial<AuditException> = {}): AuditException => ({
  issue: 'RAPP-220',
  package: 'braces',
  installedVersion: '3.0.3',
  created: '2026-10-09',
  reviewBy: '2026-11-08',
  exposure: 'build-time only',
  dependencyPath: ['apps/mobile', 'micromatch@4.0.8', 'braces@3.0.3'],
  reachableSurface: 'Build tools only.',
  advisories: [
    { id: 'GHSA-vfj7-8cjw-p6xm', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' },
  ],
  upstreamStatus: 'No patched release.',
  removalCondition: 'Remove when a patched release exists.',
  ...overrides,
});

const bracesReport = {
  braces: [{ url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }],
};

test('a clean dependency audit passes', () => {
  expect(() => validateAuditReport({}, [], now)).not.toThrow();
});

test('every advisory without an exception fails, including the retired exception', () => {
  expect(() =>
    validateAuditReport(
      { 'image-size': [{ url: 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq' }] },
      [],
      now,
    ),
  ).toThrow('Dependency audit found');
  expect(() => validateAuditReport({ unexpected: [] }, [], now)).toThrow('Dependency audit found');
});

test('an advisory listed in a current exception passes', () => {
  expect(() => validateAuditReport(bracesReport, [braces()], now)).not.toThrow();
});

test('a new advisory on an excepted package still fails', () => {
  const report = {
    braces: [
      { url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' },
      { url: 'https://github.com/advisories/GHSA-new0-0000-0000' },
    ],
  };
  expect(() => validateAuditReport(report, [braces()], now)).toThrow('GHSA-new0-0000-0000');
});

test('an exception never covers a different package', () => {
  const report = { 'node-forge': [{ url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }] };
  expect(() => validateAuditReport(report, [braces()], now)).toThrow('Dependency audit found');
});

test('an expired exception fails', () => {
  expect(() =>
    validateAuditReport(bracesReport, [braces()], Date.parse('2026-11-09T00:00:01Z')),
  ).toThrow('expired on 2026-11-08');
});

test('an exception longer than 31 days fails', () => {
  expect(() =>
    validateAuditReport(bracesReport, [braces({ reviewBy: '2026-11-10' })], now),
  ).toThrow('longer than 31 days');
});

test('an exception for an advisory that is no longer reported fails, so it gets removed', () => {
  expect(() => validateAuditReport({}, [braces()], now)).toThrow('no longer reported');
});

test('an exception without its evidence fields fails', () => {
  expect(() => validateAuditReport(bracesReport, [braces({ reachableSurface: '' })], now)).toThrow(
    'Invalid dependency audit exception',
  );
});

test('malformed audit reports fail closed', () => {
  for (const report of [null, [], '', 0, true]) {
    expect(() => validateAuditReport(report, [], now)).toThrow('Invalid dependency audit report');
  }
});
