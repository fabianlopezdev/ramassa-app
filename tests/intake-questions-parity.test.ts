/**
 * The intake question list lives in two places (RAPP-300): the TypeScript list
 * the wizard plans with, and the CHECK on `public.profile_answers.question`
 * that the database enforces. This keeps them equal without a database, so it
 * also runs in CI: it reads the block marked `intake-questions` from the
 * newest migration that defines it, so a later migration can extend the list.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'bun:test';
import { INTAKE_QUESTIONS } from '@ramassa/shared/intake';

const migrationsDirectory = resolve(import.meta.dir, '../supabase/migrations');

function newestQuestionBlock(): string {
  const withBlock = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
    .filter((sql) => sql.includes('-- intake-questions:start'));
  const sql = withBlock.at(-1);
  expect(sql).toBeDefined();
  const start = sql!.indexOf('-- intake-questions:start');
  const end = sql!.indexOf('-- intake-questions:end');
  expect(end).toBeGreaterThan(start);
  return sql!.slice(start, end);
}

test('the database question list has the same questions, in the same order, as the code', () => {
  const fromSql = [...newestQuestionBlock().matchAll(/'([a-z_]+)'/g)].map(
    ([, question]) => question,
  );
  expect(fromSql).toEqual([...INTAKE_QUESTIONS]);
});
