/**
 * The country list lives in two places (RAPP-660, D6): the shared list her
 * picker shows (`packages/shared/i18n/countries.json`) and
 * `private.country_names()`, which checks a country answer in the database.
 * This keeps them equal without a database: it reads the block marked
 * `country-names` from the newest migration that defines it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'bun:test';
import countries from '../packages/shared/i18n/countries.json';

const migrationsDirectory = resolve(import.meta.dir, '../supabase/migrations');

function newestCountryBlock(): string {
  const sql = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
    .filter((text) => text.includes('-- country-names:start'))
    .at(-1);
  expect(sql).toBeDefined();
  return sql!.slice(sql!.indexOf('-- country-names:start'), sql!.indexOf('-- country-names:end'));
}

test('the database names every country the picker stores, in the same order', () => {
  const fromSql = [...newestCountryBlock().matchAll(/'((?:[^']|'')+)'/g)].map(([, name]) =>
    name!.replaceAll("''", "'"),
  );
  expect(fromSql).toEqual(countries.map((country) => country.names.ca));
});
