/**
 * The app's intake question lists live in two places: the TypeScript lists the
 * wizard plans with, and the database functions that check them. These tests
 * keep them equal without a database, so they also run in CI: each reads the
 * block between its markers from the newest migration that defines it.
 *
 * The full question list was also a CHECK on `profile_answers.question`; that
 * table is gone since RAPP-666 (ADR-031): each answer is by field and records
 * who gave it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'bun:test';
import {
  DEFAULT_REQUIRED_INTAKE_QUESTIONS,
  LOCKED_REQUIRED_INTAKE_QUESTIONS,
  WIZARD_QUESTIONS,
} from '@ramassa/shared/intake';

const migrationsDirectory = resolve(import.meta.dir, '../supabase/migrations');

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
