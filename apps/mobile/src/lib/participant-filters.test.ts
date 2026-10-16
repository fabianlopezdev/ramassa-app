import { describe, expect, test } from 'bun:test';
import { participantSearchSchema } from '@ramassa/shared/participants';
import { activeSheetFilters, nextSort } from './participant-filters';

describe('activeSheetFilters', () => {
  const base = participantSearchSchema.parse({});

  test('counts the sheet filters, never the status chips or the search', () => {
    expect(activeSheetFilters(base)).toBe(0);
    expect(activeSheetFilters({ ...base, status: 'inactive', q: 'Ai' })).toBe(0);
    expect(activeSheetFilters({ ...base, entity: 'Creu Roja', dependents: 'with' })).toBe(2);
  });
});

describe('nextSort', () => {
  const base = participantSearchSchema.parse({});

  test('the sorted column flips; another column starts ascending', () => {
    expect(nextSort(base, 'last_name')).toEqual({ sort: 'last_name', dir: 'desc' });
    expect(nextSort({ ...base, dir: 'desc' }, 'city')).toEqual({ sort: 'city', dir: 'asc' });
  });
});
