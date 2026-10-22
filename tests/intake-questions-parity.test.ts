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
  DEFAULT_REQUIRED_INTAKE_QUESTIONS,
  INTAKE_QUESTIONS,
  LOCKED_REQUIRED_INTAKE_QUESTIONS,
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

/** The newest migration block between two markers, as the list of names it holds. */
function newestBlock(marker: string): string[] {
  const sql = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
    .filter((text) => text.includes(`-- ${marker}:start`))
    .at(-1);
  expect(sql).toBeDefined();
  const block = sql!.slice(sql!.indexOf(`-- ${marker}:start`), sql!.indexOf(`-- ${marker}:end`));
  return [...block.matchAll(/'([a-z_]+)'/g)].map(([, question]) => question!);
}

/**
 * The required questions (RAPP-301, RAPP-611) are data per organization; the
 * DEFAULT list, which applies until staff change one, lives in two places: the
 * shared list a test checks against the onboarding schemas, and
 * `private.default_required_intake_questions()`.
 */
test('the database default required list matches the code', () => {
  expect(newestBlock('required-intake-questions')).toEqual([...DEFAULT_REQUIRED_INTAKE_QUESTIONS]);
});

/** The three always required (spec guard) in both places. */
test('the database locked required list matches the code', () => {
  expect(newestBlock('locked-required-intake-questions')).toEqual([
    ...LOCKED_REQUIRED_INTAKE_QUESTIONS,
  ]);
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
