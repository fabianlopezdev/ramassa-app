/**
 * A person's first or last name (RAPP-624, pending fix 28).
 *
 * A name is trimmed at its edges of every invisible character: Unicode
 * White_Space plus Default_Ignorable_Code_Point (the zero-width characters,
 * the direction marks and isolates, the soft hyphen, the Hangul fillers, the
 * variation selectors and the tag characters). What is left must hold one
 * character that is neither invisible nor a combining mark (a mark alone has
 * no letter to sit on), or the name is blank. Inner characters stay, so a
 * Persian name keeps its zero-width non-joiner.
 *
 * The database's `private.name_trim` (20261022215000) holds the same two
 * classes as code point ranges, and a parity test compares them over every
 * code point. Unicode property escapes work in Hermes (its compiler checks
 * them at build time), in every browser the admin supports and in Bun.
 *
 * https://tc39.es/ecma262/#sec-runtime-semantics-unicodematchproperty-p
 * https://www.unicode.org/reports/tr44/#Default_Ignorable_Code_Point
 */
import { z } from 'zod';

const PERSON_NAME_MAX_LENGTH = 100;

const INVISIBLE_EDGES =
  /^[\p{White_Space}\p{Default_Ignorable_Code_Point}]+|[\p{White_Space}\p{Default_Ignorable_Code_Point}]+$/gu;
const BASE_CHARACTER = /[^\p{White_Space}\p{Default_Ignorable_Code_Point}\p{M}]/u;

/** The name without invisible edges, or '' when nothing visible stands on its own. */
export function trimPersonName(value: string): string {
  const trimmed = value.replace(INVISIBLE_EDGES, '');
  return BASE_CHARACTER.test(trimmed) ? trimmed : '';
}

/** Trimmed of invisible edges, non-empty, bounded. */
export const personNameSchema = z
  .string()
  .overwrite(trimPersonName)
  .min(1)
  .max(PERSON_NAME_MAX_LENGTH);
