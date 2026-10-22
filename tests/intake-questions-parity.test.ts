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
import {
  INTAKE_QUESTIONS,
  REQUIRED_INTAKE_QUESTIONS,
  WIZARD_QUESTIONS,
} from '@ramassa/shared/intake';

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

/**
 * The required questions (RAPP-301) also live in two places: the shared list
 * a test checks against the onboarding schemas, and the database function
 * that refuses to hide an unanswered required question.
 */
test('the database required-question list matches the code', () => {
  const sql = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
    .filter((text) => text.includes('-- required-intake-questions:start'))
    .at(-1);
  expect(sql).toBeDefined();
  const block = sql!.slice(
    sql!.indexOf('-- required-intake-questions:start'),
    sql!.indexOf('-- required-intake-questions:end'),
  );
  const fromSql = [...block.matchAll(/'([a-z_]+)'/g)].map(([, question]) => question);
  expect(fromSql).toEqual([...REQUIRED_INTAKE_QUESTIONS]);
});

/**
 * The questions a wizard screen asks also live in two places (RAPP-618): the
 * screens the phone walks and `private.wizard_intake_questions()`, which
 * `my_questions_to_ask()` lists. A question on no screen (her app language,
 * set by the language picker) must not be on it, or the preview staff see
 * says she is asked something her phone never shows.
 */
test('the database wizard-question list is the questions the screens ask', () => {
  const sql = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
    .filter((text) => text.includes('-- wizard-intake-questions:start'))
    .at(-1);
  expect(sql).toBeDefined();
  const block = sql!.slice(
    sql!.indexOf('-- wizard-intake-questions:start'),
    sql!.indexOf('-- wizard-intake-questions:end'),
  );
  const fromSql = [...block.matchAll(/'([a-z_]+)'/g)].map(([, question]) => question);
  expect(fromSql).toEqual([...WIZARD_QUESTIONS]);
});
