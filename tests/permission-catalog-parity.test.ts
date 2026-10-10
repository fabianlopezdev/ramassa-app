/**
 * The permission catalog lives in two places (RAPP-229): the TypeScript list the
 * apps build menus from, and `public.permissions`, which every access rule reads.
 * This keeps them equal without a database, so it also runs in CI: it reads the
 * catalog and preset-default blocks straight from the migration.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  BUILTIN_PRESET_DEFAULTS,
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
} from '@ramassa/shared/permissions';

const migration = readFileSync(
  resolve(import.meta.dir, '../supabase/migrations/20261010170000_permission_catalog.sql'),
  'utf8',
);

function block(name: string): string {
  const start = migration.indexOf(`-- ${name}:start`);
  const end = migration.indexOf(`-- ${name}:end`);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe('permission catalog parity', () => {
  test('the database catalog has the same codes, areas and order as the code', () => {
    const rows = [...block('permission-catalog').matchAll(/\('([a-z_.]+)', '([a-z]+)', (\d+)\)/g)];
    expect(rows.map(([, code, area, order]) => ({ code, area, order: Number(order) }))).toEqual(
      PERMISSION_CATALOG.map((permission, index) => ({ ...permission, order: index + 1 })),
    );
  });

  test('every area in the catalog is a known area, and every area is used', () => {
    expect([...new Set(PERMISSION_CATALOG.map((permission) => permission.area))]).toEqual([
      ...PERMISSION_AREAS,
    ]);
  });

  test('the Coach and Staff product defaults match the code', () => {
    const rows = [
      ...block('permission-preset-defaults').matchAll(/\('(coach|staff)', '([a-z_.]+)'\)/g),
    ];
    const fromSql = (key: string) =>
      rows.filter(([, builtinKey]) => builtinKey === key).map(([, , code]) => code);
    expect(fromSql('coach')).toEqual([...BUILTIN_PRESET_DEFAULTS.coach]);
    expect(fromSql('staff')).toEqual([...BUILTIN_PRESET_DEFAULTS.staff]);
  });

  test('Admin holds every permission, and Staff keeps sensitive data and team management out', () => {
    expect(BUILTIN_PRESET_DEFAULTS.admin).toEqual(PERMISSION_CATALOG.map(({ code }) => code));
    expect(migration).toContain("select 'admin', code from public.permissions;");
    for (const code of ['participants.view_sensitive', 'rgpd.erase', 'team.manage'] as const) {
      expect(BUILTIN_PRESET_DEFAULTS.staff).not.toContain(code);
    }
  });
});
