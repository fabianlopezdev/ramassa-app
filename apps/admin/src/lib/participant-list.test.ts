/**
 * The participants list shows a column and its filter while the feature
 * registry reads its field (RAPP-664).
 */
import { expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from '@ramassa/shared/intake-builder';
import { systemFieldsCatalogFixture } from '@ramassa/shared/testing';
import { participantListColumns } from './participant-list';

const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());

test('every column shows while each field has the type its feature reads', () => {
  expect(participantListColumns(fields)).toEqual({
    nationality: true,
    city: true,
    entity: true,
    dependents: true,
  });
});

test('a field whose type no longer fits takes its column and filter away', () => {
  const changed = new Map(fields);
  changed.set('nationality', { ...fields.get('nationality')!, type: 'short_text' });
  changed.set('has_dependents', { ...fields.get('has_dependents')!, type: 'number' });
  changed.delete('city');
  expect(participantListColumns(changed)).toEqual({
    nationality: false,
    city: false,
    entity: true,
    dependents: false,
  });
});

test('without the fields the list keeps every column', () => {
  expect(participantListColumns(new Map())).toEqual({
    nationality: true,
    city: true,
    entity: true,
    dependents: true,
  });
});
