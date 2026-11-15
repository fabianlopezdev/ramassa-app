/**
 * The features that read the app's fields live in two lists (RAPP-662, D7):
 * `FIELD_FEATURES` in `packages/shared` and `private.field_features()` in the
 * database. This keeps the feature names, system keys, answer types and
 * descriptions equal, without a database: it reads the block marked
 * `field-features` from the newest migration that defines it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'bun:test';
import { FIELD_FEATURES } from '@ramassa/shared/intake-builder';

const migrationsDirectory = resolve(import.meta.dir, '../supabase/migrations');

function registryInSql(): Record<string, { systemKey: string; types: string[]; powers: string }> {
  const sql = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
    .filter((text) => text.includes('-- field-features:start'))
    .at(-1);
  expect(sql).toBeDefined();
  const block = sql!.slice(
    sql!.indexOf('-- field-features:start'),
    sql!.indexOf('-- field-features:end'),
  );
  return Object.fromEntries(
    [...block.matchAll(/\('([a-z_.]+)', '([a-z_]+)', array\[([^\]]*)\], '([^']*)'\)/g)].map(
      ([, feature, systemKey, types, powers]) => [
        feature!,
        {
          systemKey: systemKey!,
          types: [...types!.matchAll(/'([a-z_]+)'/g)].map(([, type]) => type!),
          powers: powers!,
        },
      ],
    ),
  );
}

test('every feature reads the same field and types in both lists', () => {
  const sql = registryInSql();
  expect(Object.keys(sql).length).toBeGreaterThan(5);
  expect<Record<string, { systemKey: string; types: string[]; powers: string }>>(
    Object.fromEntries(
      Object.entries(FIELD_FEATURES).map(([feature, entry]) => [
        feature,
        { systemKey: entry.systemKey, types: [...entry.types], powers: entry.powers },
      ]),
    ),
  ).toEqual(sql);
});
