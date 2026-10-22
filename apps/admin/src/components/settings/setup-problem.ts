/**
 * The database's refusal of a setup file, as a sentence in the admin's
 * language (RAPP-621).
 *
 * The preview reports `ONBOARDING_SETUP/<CODE>: <English sentence>`
 * (`private.onboarding_setup_problem`, 20261022214000). The English sentence
 * is for logs and support: the admin reads the code's own translated
 * sentence. A MALFORMED reason and the part a REFUSED_VALUE names are known
 * sentences, matched here; one this admin does not know yet reads as the
 * general sentence of its code.
 */

/** A part of the file the database refused a value in, by the words it uses. */
const REFUSED_PARTS = {
  'a screen': 'setupTransfer.databaseProblem.part.screen',
  'a question': 'setupTransfer.databaseProblem.part.question',
  'an answer option': 'setupTransfer.databaseProblem.part.option',
  'a change to an app question': 'setupTransfer.databaseProblem.part.builtinQuestionOverride',
  'the wording of an app screen': 'setupTransfer.databaseProblem.part.builtinScreen',
  'the screen order': 'setupTransfer.databaseProblem.part.flowOrder',
  'the list of required questions': 'setupTransfer.databaseProblem.part.requiredQuestions',
  'a preset': 'setupTransfer.databaseProblem.part.preset',
  'the document step note': 'setupTransfer.databaseProblem.part.documentStepExplanation',
  'a season': 'setupTransfer.databaseProblem.part.season',
  'the app terms': 'setupTransfer.databaseProblem.part.appTerms',
  'the authorization': 'setupTransfer.databaseProblem.part.authorization',
} as const;
const OTHER_PART = 'setupTransfer.databaseProblem.part.other';

/** Each MALFORMED reason the database gives, by the start of its sentence. */
const MALFORMED_REASONS = [
  ['schema_version must be the number 1', 'setupTransfer.versionNotNumber'],
  ['the file is incomplete or damaged', 'setupTransfer.damaged'],
  ['more than one current season', 'setupTransfer.databaseProblem.malformed.twoCurrentSeasons'],
  ['an id appears twice', 'setupTransfer.databaseProblem.malformed.repeatedId'],
  [
    'a condition names a question or option that is not in the file',
    'setupTransfer.databaseProblem.malformed.conditionOutside',
  ],
  ['the flow order has more than 200 steps', 'setupTransfer.databaseProblem.malformed.flowTooMany'],
  ['the flow order names a step twice', 'setupTransfer.databaseProblem.malformed.flowRepeated'],
  [
    'the summary, the terms and the authorization always end the onboarding',
    'setupTransfer.databaseProblem.malformed.flowFixedEnd',
  ],
  [
    'the flow order names an archived screen',
    'setupTransfer.databaseProblem.malformed.flowArchived',
  ],
  [
    'the flow order names a step that is not in the file',
    'setupTransfer.databaseProblem.malformed.flowMissing',
  ],
  [
    'a preset sets ask or skip on wizard questions',
    'setupTransfer.databaseProblem.malformed.presetWizard',
  ],
  ['a value in the file has the wrong form', 'setupTransfer.databaseProblem.malformed.wrongForm'],
] as const;

const CODE_SENTENCES = {
  EMPTY: 'setupTransfer.empty',
  NOT_A_SETUP: 'setupTransfer.notSetup',
  UNKNOWN_SCHEMA_VERSION: 'setupTransfer.unknownVersion',
  TOO_LARGE: 'setupTransfer.databaseProblem.tooLarge',
  NOT_EMPTY: 'setupTransfer.databaseProblem.notEmpty',
  MALFORMED: 'setupTransfer.damaged',
  REFUSED_VALUE: 'setupTransfer.databaseProblem.refusedValue',
} as const;
const UNKNOWN_SENTENCE = 'setupTransfer.databaseProblem.unknown';

type Code = keyof typeof CODE_SENTENCES;

/** Every key a refusal can read as (the locale test checks each one). */
export const SETUP_PROBLEM_KEYS: readonly string[] = [
  ...new Set<string>([
    ...Object.values(CODE_SENTENCES),
    ...MALFORMED_REASONS.map(([, key]) => key),
    ...Object.values(REFUSED_PARTS),
    OTHER_PART,
    UNKNOWN_SENTENCE,
  ]),
];

export interface SetupProblem {
  /** The database's code, or UNKNOWN for a sentence without one this admin knows. */
  readonly code: Code | 'UNKNOWN';
  /** The settings key of the sentence to show. */
  readonly key: string;
  /** Interpolation values; `part` is itself a settings key to translate. */
  readonly values: Readonly<Record<string, string>>;
}

function isCode(value: string): value is Code {
  return Object.hasOwn(CODE_SENTENCES, value);
}

export function describeSetupProblem(problem: string): SetupProblem {
  const match = /^ONBOARDING_SETUP\/([A-Z_]+): ([\s\S]*)$/.exec(problem);
  const code = match?.[1];
  const sentence = match?.[2] ?? '';
  if (code === undefined || !isCode(code)) {
    return { code: 'UNKNOWN', key: UNKNOWN_SENTENCE, values: {} };
  }
  if (code === 'UNKNOWN_SCHEMA_VERSION') {
    const version = /schema version (\S+?);/.exec(sentence)?.[1] ?? '?';
    return { code, key: CODE_SENTENCES[code], values: { version } };
  }
  if (code === 'MALFORMED') {
    const reason = MALFORMED_REASONS.find(([start]) => sentence.startsWith(start));
    return { code, key: reason?.[1] ?? CODE_SENTENCES[code], values: {} };
  }
  if (code === 'REFUSED_VALUE') {
    const part = Object.entries(REFUSED_PARTS).find(([words]) =>
      sentence.startsWith(`${words} in the file`),
    );
    return { code, key: CODE_SENTENCES[code], values: { part: part?.[1] ?? OTHER_PART } };
  }
  return { code, key: CODE_SENTENCES[code], values: {} };
}
