/**
 * App terms version 1 (RAPP-613) is the text the app bundled: its migration
 * holds the literal `scripts/generate-app-terms-v1.ts` prints from the locale
 * files. This keeps the two equal, so a reworded bundled string cannot drift
 * from what existing acceptances were made on without anyone noticing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'bun:test';
import { appTermsVersionOneSql } from '../scripts/generate-app-terms-v1';

const migrationsDirectory = resolve(import.meta.dir, '../supabase/migrations');

test('the version 1 migration block is the bundled text, word for word', () => {
  const sql = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
    .find((text) => text.includes('-- app-terms-v1:start'));
  expect(sql).toBeDefined();
  const block = sql!
    .slice(
      sql!.indexOf('-- app-terms-v1:start') + '-- app-terms-v1:start'.length,
      sql!.indexOf('-- app-terms-v1:end'),
    )
    .trim();
  expect(block).toBe(appTermsVersionOneSql());
});
