/**
 * A person's first or last name (RAPP-624, pending fix 28).
 *
 * JavaScript's `trim()` removes Unicode whitespace but not the zero-width
 * characters, so a name of only U+200B passed `z.string().trim().min(1)`.
 * The edges are trimmed of the whitespace `trim()` removes plus U+180E,
 * U+200B to U+200D and U+2060: the exact set of the database's
 * `private.name_trim` (20261022211000), so the form and every database path
 * agree on which names are blank. Inner spaces stay.
 *
 * https://tc39.es/ecma262/#sec-string.prototype.trim
 */
import { z } from 'zod';

const PERSON_NAME_MAX_LENGTH = 100;

const EDGE_CHARACTERS =
  '[\\u0009-\\u000d\\u0020\\u00a0\\u1680\\u180e\\u2000-\\u200d\\u2028\\u2029\\u202f\\u205f\\u2060\\u3000\\ufeff]+';
const NAME_EDGES = new RegExp(`^${EDGE_CHARACTERS}|${EDGE_CHARACTERS}$`, 'gu');

export function trimPersonName(value: string): string {
  return value.replace(NAME_EDGES, '');
}

/** Trimmed of invisible edges, non-empty, bounded. */
export const personNameSchema = z
  .string()
  .overwrite(trimPersonName)
  .min(1)
  .max(PERSON_NAME_MAX_LENGTH);
