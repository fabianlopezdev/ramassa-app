/**
 * The database's refusal of a setup file reads in the admin's language
 * (RAPP-621): every `ONBOARDING_SETUP/*` code, every MALFORMED reason and
 * every part a REFUSED_VALUE names has its own sentence in ca, es and en, so
 * no English sentence from the database is shown inside a translated one.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { describeSetupProblem, SETUP_PROBLEM_KEYS, type SetupProblem } from './setup-problem';

const ADVICE = ' Download the file again from an app at the same version.';

/** Each sentence the database writes (20261022214000), and what it reads as. */
const DATABASE_PROBLEMS: ReadonlyArray<
  readonly [string, { code: SetupProblem['code']; key: string; values?: Record<string, string> }]
> = [
  [
    'ONBOARDING_SETUP/EMPTY: the file holds no onboarding setup to import',
    { code: 'EMPTY', key: 'setupTransfer.empty' },
  ],
  [
    'ONBOARDING_SETUP/NOT_A_SETUP: this file is not an onboarding setup export',
    { code: 'NOT_A_SETUP', key: 'setupTransfer.notSetup' },
  ],
  [
    'ONBOARDING_SETUP/UNKNOWN_SCHEMA_VERSION: this file uses onboarding setup schema version 7; this app reads version 1. Export it again from an app at the same version.',
    {
      code: 'UNKNOWN_SCHEMA_VERSION',
      key: 'setupTransfer.unknownVersion',
      values: { version: '7' },
    },
  ],
  [
    'ONBOARDING_SETUP/TOO_LARGE: the file is larger than 5 MB',
    { code: 'TOO_LARGE', key: 'setupTransfer.databaseProblem.tooLarge' },
  ],
  [
    'ONBOARDING_SETUP/NOT_EMPTY: this organization already has onboarding settings (screens, seasons)',
    { code: 'NOT_EMPTY', key: 'setupTransfer.databaseProblem.notEmpty' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: schema_version must be the number 1',
    { code: 'MALFORMED', key: 'setupTransfer.versionNotNumber' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged',
    { code: 'MALFORMED', key: 'setupTransfer.damaged' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: more than one current season',
    { code: 'MALFORMED', key: 'setupTransfer.databaseProblem.malformed.twoCurrentSeasons' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: an id appears twice',
    { code: 'MALFORMED', key: 'setupTransfer.databaseProblem.malformed.repeatedId' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: a condition names a question or option that is not in the file',
    { code: 'MALFORMED', key: 'setupTransfer.databaseProblem.malformed.conditionOutside' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: the flow order has more than 200 steps',
    { code: 'MALFORMED', key: 'setupTransfer.databaseProblem.malformed.flowTooMany' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: the flow order names a step twice',
    { code: 'MALFORMED', key: 'setupTransfer.databaseProblem.malformed.flowRepeated' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: the summary, the terms and the authorization always end the onboarding',
    { code: 'MALFORMED', key: 'setupTransfer.databaseProblem.malformed.flowFixedEnd' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: the flow order names an archived screen',
    { code: 'MALFORMED', key: 'setupTransfer.databaseProblem.malformed.flowArchived' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: the flow order names a step that is not in the file',
    { code: 'MALFORMED', key: 'setupTransfer.databaseProblem.malformed.flowMissing' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: a preset sets ask or skip on wizard questions',
    { code: 'MALFORMED', key: 'setupTransfer.databaseProblem.malformed.presetWizard' },
  ],
  [
    `ONBOARDING_SETUP/MALFORMED: a value in the file has the wrong form (a date, a number or an id).${ADVICE}`,
    { code: 'MALFORMED', key: 'setupTransfer.databaseProblem.malformed.wrongForm' },
  ],
  [
    'ONBOARDING_SETUP/MALFORMED: a reason a later database adds',
    { code: 'MALFORMED', key: 'setupTransfer.damaged' },
  ],
  [
    'a sentence of a draft function, without a code',
    { code: 'UNKNOWN', key: 'setupTransfer.databaseProblem.unknown' },
  ],
  [
    'ONBOARDING_SETUP/SOMETHING_NEW: a code this admin does not know yet',
    { code: 'UNKNOWN', key: 'setupTransfer.databaseProblem.unknown' },
  ],
];

/** The part each REFUSED_VALUE names (onboarding_setup_problem), by its table. */
const REFUSED_PARTS: ReadonlyArray<readonly [string, string]> = [
  ['a screen', 'screen'],
  ['a question', 'question'],
  ['an answer option', 'option'],
  ['a change to an app question', 'builtinQuestionOverride'],
  ['the wording of an app screen', 'builtinScreen'],
  ['the screen order', 'flowOrder'],
  ['the list of required questions', 'requiredQuestions'],
  ['a preset', 'preset'],
  ['the document step note', 'documentStepExplanation'],
  ['a season', 'season'],
  ['the app terms', 'appTerms'],
  ['the authorization', 'authorization'],
  ['a part', 'other'],
];

describe('a database refusal in the admin language (RAPP-621)', () => {
  test.each(DATABASE_PROBLEMS)('%s', (problem, expected) => {
    expect(describeSetupProblem(problem)).toEqual({ values: {}, ...expected });
  });

  test.each(REFUSED_PARTS)('a refused value in %s names its part', (english, part) => {
    expect(
      describeSetupProblem(
        `ONBOARDING_SETUP/REFUSED_VALUE: ${english} in the file has a value this app does not accept.${ADVICE}`,
      ),
    ).toEqual({
      code: 'REFUSED_VALUE',
      key: 'setupTransfer.databaseProblem.refusedValue',
      values: { part: `setupTransfer.databaseProblem.part.${part}` },
    });
  });

  test('every sentence exists in Catalan, Spanish and English, and each is translated', () => {
    const catalogs = Object.fromEntries(
      (['ca', 'es', 'en'] as const).map((language) => [
        language,
        JSON.parse(
          readFileSync(
            resolve(
              import.meta.dir,
              `../../../../../packages/shared/i18n/locales/${language}/settings.json`,
            ),
            'utf8',
          ),
        ) as Record<string, unknown>,
      ]),
    );
    const lookup = (language: string, key: string): unknown =>
      key
        .split('.')
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown> | undefined)?.[part],
          catalogs[language],
        );
    for (const key of SETUP_PROBLEM_KEYS) {
      for (const language of ['ca', 'es', 'en']) {
        expect(typeof lookup(language, key)).toBe('string');
      }
      expect(lookup('ca', key)).not.toBe(lookup('en', key));
      expect(lookup('es', key)).not.toBe(lookup('en', key));
    }
  });
});
