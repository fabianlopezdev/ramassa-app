/**
 * The app's fields live in two lists (RAPP-661): `SYSTEM_FIELD_QUESTIONS` in
 * `packages/shared`, which turns the apps' column payloads into answers by
 * field, and `private.system_profile_fields()`, the database's catalog. This
 * keeps the system keys and the app question each belongs to equal, without a
 * database: it reads the block marked `system-profile-fields` from the newest
 * migration that defines it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'bun:test';
import { SYSTEM_FIELD_QUESTIONS } from '@ramassa/shared/intake';

const migrationsDirectory = resolve(import.meta.dir, '../supabase/migrations');

function catalogQuestions(): Record<string, string> {
  const sql = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
    .filter((text) => text.includes('-- system-profile-fields:start'))
    .at(-1);
  expect(sql).toBeDefined();
  const block = sql!.slice(
    sql!.indexOf('-- system-profile-fields:start'),
    sql!.indexOf('-- system-profile-fields:end'),
  );
  return Object.fromEntries(
    [...block.matchAll(/\('([a-z_]+)', (?:null|'[a-z_]+'), '([a-z_]+)',/g)].map(
      ([, systemKey, question]) => [systemKey!, question!],
    ),
  );
}

test('every app field has the same system key and question in both lists', () => {
  const catalog = catalogQuestions();
  expect(Object.keys(catalog).length).toBeGreaterThan(20);
  expect<Record<string, string>>({ ...SYSTEM_FIELD_QUESTIONS }).toEqual(catalog);
});
