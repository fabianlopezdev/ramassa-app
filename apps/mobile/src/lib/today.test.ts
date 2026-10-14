import { expect, test } from 'bun:test';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { todaySections } from './today';

const none = new Set<PermissionCode>();

test('Today shows a section per area she may use, field work first', () => {
  expect(todaySections(['messages', 'attendance'], none)).toEqual(['attendance', 'messages']);
  expect(todaySections(['messages'], none)).toEqual(['messages']);
  expect(todaySections([], none)).toEqual([]);
});

test('material shows for whoever counts stock or hands it out', () => {
  expect(todaySections(['attendance'], new Set<PermissionCode>(['equipment.handover']))).toEqual([
    'attendance',
    'material',
  ]);
  expect(todaySections([], new Set<PermissionCode>(['equipment.count']))).toEqual(['material']);
  expect(todaySections([], new Set<PermissionCode>(['equipment.receive']))).toEqual([]);
});

test('waiting service reviews show for whoever reviews them (RAPP-345)', () => {
  expect(
    todaySections(['messages', 'content'], new Set<PermissionCode>(['services.review'])),
  ).toEqual(['reviews', 'messages']);
  expect(todaySections(['content'], new Set<PermissionCode>(['services.edit']))).toEqual([]);
});

test('open forum reports show for whoever moderates the forum (RAPP-380)', () => {
  expect(todaySections([], new Set<PermissionCode>(['forum.moderate', 'services.review']))).toEqual(
    ['reviews', 'forum'],
  );
});

test('mentoring requests show for whoever manages them (RAPP-382)', () => {
  expect(
    todaySections(['messages'], new Set<PermissionCode>(['mentoring.manage', 'forum.moderate'])),
  ).toEqual(['forum', 'mentoring', 'messages']);
});
