import { expect, test } from 'bun:test';
import { validateAuditReport } from '../scripts/verify-dependency-audit';

test('a clean dependency audit passes', () => {
  expect(() => validateAuditReport({})).not.toThrow();
});

test('every dependency advisory fails, including the retired exception', () => {
  expect(() =>
    validateAuditReport({
      'image-size': [{ url: 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq' }],
    }),
  ).toThrow('Dependency audit found');
  expect(() => validateAuditReport({ unexpected: [] })).toThrow('Dependency audit found');
});

test('malformed audit reports fail closed', () => {
  for (const report of [null, [], '', 0, true]) {
    expect(() => validateAuditReport(report)).toThrow('Invalid dependency audit report');
  }
});
