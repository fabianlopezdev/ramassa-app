/**
 * The permission catalog lives in two places (RAPP-229): the TypeScript list the
 * apps build menus from, and `public.permissions`, which every access rule reads.
 * This keeps them equal without a database, so it also runs in CI: it reads the
 * catalog and preset-default blocks straight from the migration.
 */
import { readdirSync, readFileSync } from 'node:fs';
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

/**
 * A later migration that adds a permission restates the whole catalog block
 * (RAPP-304), so the catalog is read from the newest migration that has one.
 * The preset defaults stay in the first migration: later ones add only Admin
 * rows, which Admin's "every permission" rule covers.
 */
const migrationsDirectory = resolve(import.meta.dir, '../supabase/migrations');
const allMigrations = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'));
const newestCatalogMigration =
  allMigrations.filter((sql) => sql.includes('-- permission-catalog:start')).at(-1) ?? migration;

function block(name: string, sql = migration): string {
  const start = sql.indexOf(`-- ${name}:start`);
  const end = sql.indexOf(`-- ${name}:end`);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('permission catalog parity', () => {
  test('the database catalog has the same codes, areas and order as the code', () => {
    const rows = [
      ...block('permission-catalog', newestCatalogMigration).matchAll(
        /\('([a-z_.]+)', '([a-z]+)', (\d+)\)/g,
      ),
    ];
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
    // Later migrations add defaults in their own block (RAPP-305), so the rows
    // of every migration's block count, compared in catalog order.
    const rows = allMigrations.flatMap((sql) =>
      sql.includes('-- permission-preset-defaults:start')
        ? [
            ...block('permission-preset-defaults', sql).matchAll(
              /\('(coach|staff)', '([a-z_.]+)'\)/g,
            ),
          ]
        : [],
    );
    const catalogOrder = PERMISSION_CATALOG.map(({ code }) => code) as string[];
    const inCatalogOrder = (codes: readonly string[]) =>
      [...new Set(codes)].sort((a, b) => catalogOrder.indexOf(a) - catalogOrder.indexOf(b));
    const fromSql = (key: string) =>
      inCatalogOrder(
        rows.filter(([, builtinKey]) => builtinKey === key).map(([, , code]) => code!),
      );
    expect(fromSql('coach')).toEqual(inCatalogOrder(BUILTIN_PRESET_DEFAULTS.coach));
    expect(fromSql('staff')).toEqual(inCatalogOrder(BUILTIN_PRESET_DEFAULTS.staff));
  });

  test('Admin holds every permission, and Staff keeps sensitive data and team management out', () => {
    expect(BUILTIN_PRESET_DEFAULTS.admin).toEqual(PERMISSION_CATALOG.map(({ code }) => code));
    expect(migration).toContain("select 'admin', code from public.permissions;");
    for (const code of [
      'participants.view_sensitive',
      'participants.view_health',
      'rgpd.erase',
      'team.manage',
    ] as const) {
      expect(BUILTIN_PRESET_DEFAULTS.staff).not.toContain(code);
    }
  });
});
