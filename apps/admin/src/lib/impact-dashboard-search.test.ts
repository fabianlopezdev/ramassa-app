import { expect, test } from 'bun:test';
import {
  createDefaultImpactPeriod,
  createImpactDashboardSearchSchema,
} from './impact-dashboard-search';

test('default impact period is the current Madrid calendar year through today', () => {
  expect(createDefaultImpactPeriod(new Date('2026-12-31T23:30:00Z'))).toEqual({
    start: '2027-01-01',
    end: '2027-01-01',
  });
});

test('search validation rejects reversed dates and drops hostile filter identifiers', () => {
  const schema = createImpactDashboardSearchSchema({ start: '2026-01-01', end: '2026-08-21' });
  expect(schema.parse({ category: '<script>', entity: '../../etc/passwd' })).toEqual({
    start: '2026-01-01',
    end: '2026-08-21',
  });
  expect(() => schema.parse({ start: '2026-09-01', end: '2026-08-21' })).toThrow();
});

test('the page works out its default period when it reads the address (RAPP-974)', () => {
  let calls = 0;
  const schema = createImpactDashboardSearchSchema(() => {
    calls += 1;
    return { start: '2026-01-01', end: `2026-11-${String(24 + calls).padStart(2, '0')}` };
  });
  expect(schema.parse({}).end).toBe('2026-11-25');
  expect(schema.parse({}).end).toBe('2026-11-26');
});
