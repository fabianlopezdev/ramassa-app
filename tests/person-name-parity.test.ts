/**
 * A person's name is blank by one rule in two places (RAPP-624): the shared
 * Zod schema (`packages/shared/schemas/person-name.ts`, Unicode property
 * escapes) and the database's `private.name_trim` (code point ranges). This
 * keeps them equal without a database, so it also runs in CI: it reads the
 * ranges from the newest migration that defines the function, and the ranges
 * the pgTAP test (0125) checks the live function against.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { personNameSchema, trimPersonName } from '@ramassa/shared/schemas';

const LAST_CODE_POINT = 0x10ffff;
const isSurrogate = (codePoint: number) => codePoint >= 0xd800 && codePoint <= 0xdfff;

const migrationsDirectory = resolve(import.meta.dir, '../supabase/migrations');
const nameTrimMigration = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
  .filter((sql) => sql.includes('-- name-trim-invisible:start'))
  .at(-1);
const pgTapTest = readFileSync(
  resolve(import.meta.dir, '../supabase/tests/0125_names_never_invisible_test.sql'),
  'utf8',
);

function between(source: string, marker: string): string {
  const start = source.indexOf(`-- ${marker}:start`);
  const end = source.indexOf(`-- ${marker}:end`);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** The SQL string pieces between a marker pair, joined. */
function sqlLiteral(source: string, marker: string): string {
  return [...between(source, marker).matchAll(/'([^']*)'/g)].map(([, piece]) => piece).join('');
}

/** A Postgres bracket-expression body of \uXXXX and \UXXXXXXXX escapes and ranges. */
function membersOfSqlClass(body: string): Uint8Array {
  const members = new Uint8Array(LAST_CODE_POINT + 1);
  const escape = String.raw`\\(?:u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8}))`;
  const item = new RegExp(`^${escape}(?:-${escape})?`);
  let rest = body;
  while (rest.length > 0) {
    const match = item.exec(rest);
    if (match === null) throw new Error(`unexpected class text: ${rest.slice(0, 20)}`);
    const low = Number.parseInt(match[1] ?? match[2]!, 16);
    const high =
      match[3] === undefined && match[4] === undefined
        ? low
        : Number.parseInt(match[3] ?? match[4]!, 16);
    members.fill(1, low, high + 1);
    rest = rest.slice(match[0].length);
  }
  return members;
}

/** The pgTAP literal: comma-separated hex code points and hex ranges. */
function membersOfRangeList(list: string): Uint8Array {
  const members = new Uint8Array(LAST_CODE_POINT + 1);
  for (const range of list.split(',')) {
    const [low, high = low] = range.split('-').map((hex) => Number.parseInt(hex, 16));
    members.fill(1, low!, high! + 1);
  }
  return members;
}

const INVISIBLE = /^[\p{White_Space}\p{Default_Ignorable_Code_Point}]$/u;
const MARK = /^\p{M}$/u;

describe('person name parity (RAPP-624)', () => {
  expect(nameTrimMigration).toBeDefined();
  const sqlInvisible = membersOfSqlClass(sqlLiteral(nameTrimMigration!, 'name-trim-invisible'));
  const sqlMarks = membersOfSqlClass(sqlLiteral(nameTrimMigration!, 'name-trim-marks'));
  const pgTapBlank = membersOfRangeList(sqlLiteral(pgTapTest, 'name-blank-ranges'));

  test('every code point is invisible, a mark or neither on both sides', () => {
    const mismatches: string[] = [];
    for (let codePoint = 0; codePoint <= LAST_CODE_POINT; codePoint++) {
      if (isSurrogate(codePoint)) continue;
      const character = String.fromCodePoint(codePoint);
      const invisible = INVISIBLE.test(character);
      const blank = invisible || MARK.test(character);
      if ((sqlInvisible[codePoint] === 1) !== invisible)
        mismatches.push(`invisible ${codePoint.toString(16)}`);
      if ((sqlInvisible[codePoint] === 1 || sqlMarks[codePoint] === 1) !== blank) {
        mismatches.push(`blank ${codePoint.toString(16)}`);
      }
      if (codePoint > 0 && (pgTapBlank[codePoint] === 1) !== blank) {
        mismatches.push(`pgTAP ${codePoint.toString(16)}`);
      }
      if ((trimPersonName(character) === '') !== blank)
        mismatches.push(`schema ${codePoint.toString(16)}`);
    }
    expect(mismatches).toEqual([]);
  });

  test('the pgTAP scan covers every plane that holds a blank code point (0, 1 and 14)', () => {
    const planes = new Set<number>();
    pgTapBlank.forEach((member, codePoint) => {
      if (member === 1) planes.add(codePoint >> 16);
    });
    expect([...planes]).toEqual([0, 1, 14]);
  });

  test('each listed class alone is refused; with a letter it is a name', () => {
    for (const codePoint of [
      0x200e, 0x200f, 0x061c, 0x00ad, 0x034f, 0x2062, 0x202e, 0x2066, 0x3164, 0xffa0, 0xe0020,
      0x0301,
    ]) {
      const character = String.fromCodePoint(codePoint);
      expect(personNameSchema.safeParse(character).success).toBe(false);
      expect(personNameSchema.parse(`Amina${character}`)).toBe(
        MARK.test(character) && !INVISIBLE.test(character) ? `Amina${character}` : 'Amina',
      );
    }
  });
});
