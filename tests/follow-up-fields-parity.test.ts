/**
 * The app's follow-ups live in two lists (RAPP-720): `DETAIL_SCREEN_BRANCHES`
 * and `FOLLOW_UP_OWN_FIELDS` in `packages/shared`, and
 * `private.app_follow_ups()` with `private.app_follow_up_own_fields()` in the
 * database. This keeps them equal without a database: it reads the marked
 * blocks of the newest migration that defines them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'bun:test';
import { DETAIL_SCREEN_BRANCHES, FOLLOW_UP_OWN_FIELDS } from '@ramassa/shared/intake';

const migrationsDirectory = resolve(import.meta.dir, '../supabase/migrations');

function block(marker: string): string {
  const sql = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
    .filter((text) => text.includes(`-- ${marker}:start`))
    .at(-1);
  expect(sql).toBeDefined();
  return sql!.slice(sql!.indexOf(`-- ${marker}:start`), sql!.indexOf(`-- ${marker}:end`));
}

test('every follow-up opens from the same screen on the same answers in both lists', () => {
  const rows = [
    ...block('app-follow-ups').matchAll(
      /\('([a-z-]+)', '([a-z-]+)', '([a-z_]+)',\s*array\[([^\]]*)\]\)/g,
    ),
  ].map(([, screen, parent, field, answers]) => ({
    screen,
    parent,
    field,
    answers: [...answers!.matchAll(/'([a-z_]+)'/g)].map(([, answer]) => answer),
  }));
  expect(rows).toEqual(
    DETAIL_SCREEN_BRANCHES.map((branch) => ({
      screen: branch.screen,
      parent: branch.parent,
      field: branch.condition.field,
      answers: [...branch.condition.answers],
    })),
  );
});

test('every follow-up starts with the same own fields, order and flags in both lists', () => {
  const rows = [
    ...block('app-follow-up-own-fields').matchAll(
      /\('([a-z-]+)', '([a-z_]+)', (\d+), (true|false)\)/g,
    ),
  ].map(([, screen, key, place, required]) => [screen, key, Number(place), required === 'true']);
  expect(rows).toEqual(
    Object.entries(FOLLOW_UP_OWN_FIELDS).flatMap(([screen, fields]) =>
      fields.map((field, place) => [screen, field.key, place, field.required]),
    ),
  );
});
