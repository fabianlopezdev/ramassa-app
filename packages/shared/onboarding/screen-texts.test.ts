/**
 * The built-in screen wording staff edit (RAPP-612): the fields each screen
 * takes, the bundled fallback in every language, and the database's copy of
 * both lists, read from the migration on disk (the last definition wins).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { WIZARD_QUESTION_SCREENS, WIZARD_SCREEN_QUESTIONS } from './intake';
import {
  BUNDLED_SCREEN_TEXT_KEYS,
  EDITABLE_WIZARD_SCREENS,
  editableScreenOf,
  screenTextFields,
} from './screen-texts';

function lastBlock(marker: string): string {
  const directory = join(import.meta.dir, '../../../supabase/migrations');
  let latest: string | undefined;
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(join(directory, file), 'utf8');
    const block = new RegExp(`-- ${marker}:start([\\s\\S]*?)-- ${marker}:end`).exec(sql);
    if (block !== null) latest = block[1];
  }
  if (latest === undefined) throw new Error(`no ${marker} block in the migrations`);
  return latest;
}

function rows(block: string): [string, string[]][] {
  return [...block.matchAll(/\('([a-z-]+)', array\[([^\]]*)\]\)/g)].map((match) => [
    match[1]!,
    [...match[2]!.matchAll(/'([a-z_]+)'/g)].map((value) => value[1]!),
  ]);
}

/**
 * The app screen of each app question, from the database's field catalog
 * (`private.system_profile_fields()`, ADR-031): each first part's tuple ends
 * with the screen whose own control asks it.
 */
function screensOfFields(block: string): [string, string[]][] {
  const screens = new Map<string, string[]>();
  for (const match of block.matchAll(/\('[a-z_]+', null, '([a-z_]+)',.*, '([a-z-]+)'\),?$/gm)) {
    const questions = screens.get(match[2]!) ?? [];
    screens.set(match[2]!, [...questions, match[1]!]);
  }
  return [...screens.entries()];
}

describe('the database lists match the app (parity)', () => {
  test("each built-in screen asks the same questions, in the app's own order", () => {
    expect(screensOfFields(lastBlock('system-profile-fields'))).toEqual(
      WIZARD_QUESTION_SCREENS.map((screen) => [screen, [...WIZARD_SCREEN_QUESTIONS[screen]]]),
    );
  });

  test('each screen takes the same fields', () => {
    expect(rows(lastBlock('builtin-screen-text-fields'))).toEqual(
      EDITABLE_WIZARD_SCREENS.map((screen) => [screen, [...screenTextFields(screen)]]),
    );
  });
});

describe('screen wording', () => {
  test('the terms screens never take a title or an intro: those are the terms version', () => {
    expect(screenTextFields('terms-intro')).not.toContain('title');
    expect(screenTextFields('terms')).not.toContain('intro');
    expect(screenTextFields('terms')).toContain('decline_label');
    expect(screenTextFields('summary')).toEqual(['title', 'intro', 'help', 'continue_label']);
  });

  test('every bundled fallback exists in all five languages', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const bundled = JSON.parse(
        readFileSync(join(import.meta.dir, `../i18n/locales/${language}/onboarding.json`), 'utf8'),
      ) as Record<string, unknown>;
      for (const screen of EDITABLE_WIZARD_SCREENS) {
        for (const [field, key] of Object.entries(BUNDLED_SCREEN_TEXT_KEYS[screen])) {
          expect(screenTextFields(screen)).toContain(field as never);
          expect(typeof bundled[key]).toBe('string');
        }
      }
    }
  });

  test('every support need detail screen shares one wording; a staff screen has none', () => {
    expect(editableScreenOf('needs-detail:combined')).toBe('specific-needs-details');
    expect(editableScreenOf('summary')).toBe('summary');
    expect(editableScreenOf('custom:abc')).toBeNull();
    expect(editableScreenOf(undefined)).toBeNull();
  });
});
