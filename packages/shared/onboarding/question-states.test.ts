/**
 * Staff choose, per question and per woman, whether her wizard asks it
 * (RAPP-301): Auto asks only what nobody answered, Ask always asks, Don't ask
 * never does. A required question needs an answer before it can be hidden, so
 * every finished profile is complete.
 */
import { describe, expect, test } from 'bun:test';
import {
  documentationStepSchema,
  documentationStepSchemaFor,
  identityStepSchema,
  identityStepSchemaFor,
  logisticsStepSchema,
  logisticsStepSchemaFor,
} from '../schemas/onboarding';
import type { IntakeQuestion } from './intake';
import {
  canSkipQuestion,
  DEFAULT_REQUIRED_INTAKE_QUESTIONS,
  fetchMyQuestionsToAsk,
  fetchParticipantQuestionStates,
  INTAKE_STATE_PRESETS,
  questionStateChanges,
  questionStatesSchema,
  questionsToAsk,
  saveParticipantQuestionStates,
  WIZARD_QUESTIONS,
} from './question-states';

const answered = (...questions: IntakeQuestion[]) => new Set<IntakeQuestion>(questions);

/** The form field behind each question, to check the required list against the schemas. */
const FIELD_QUESTION: Record<string, IntakeQuestion> = {
  firstName: 'first_name',
  lastName: 'last_name',
  dateOfBirth: 'date_of_birth',
  placeOfBirth: 'place_of_birth',
  nationality: 'nationality',
  preferredLanguage: 'preferred_language',
  documentType: 'document',
  phone: 'phone',
  address: 'address',
  city: 'city',
  postalCode: 'postal_code',
  referenceEntity: 'reference_entity',
  referenceContactName: 'reference_contact_name',
  hasDependents: 'dependents',
  clothingSize: 'clothing_size',
  shoeSize: 'shoe_size',
};

/** The questions an empty step refuses, through the step schemas. */
function requiredBy(
  schemas: readonly { safeParse: (value: unknown) => { success: boolean; error?: unknown } }[],
): Set<IntakeQuestion> {
  const required = new Set<IntakeQuestion>();
  for (const schema of schemas) {
    const result = schema.safeParse({});
    if (result.success) continue;
    for (const issue of (result.error as { issues: { path: PropertyKey[] }[] }).issues) {
      const question = FIELD_QUESTION[String(issue.path[0])];
      if (question !== undefined) required.add(question);
    }
  }
  return required;
}

describe('DEFAULT_REQUIRED_INTAKE_QUESTIONS', () => {
  test('is exactly what the onboarding schemas require by default, so it cannot drift', () => {
    expect(requiredBy([identityStepSchema, documentationStepSchema, logisticsStepSchema])).toEqual(
      new Set<IntakeQuestion>(DEFAULT_REQUIRED_INTAKE_QUESTIONS),
    );
  });

  test('the document is not required since RAPP-302', () => {
    expect(DEFAULT_REQUIRED_INTAKE_QUESTIONS).not.toContain('document');
  });

  test('the schemas follow the list staff choose; her names and language always stay (RAPP-611)', () => {
    const chosen = new Set<IntakeQuestion>(['document', 'phone']);
    expect(
      requiredBy([
        identityStepSchemaFor(chosen),
        documentationStepSchemaFor(chosen),
        logisticsStepSchemaFor(chosen),
      ]),
    ).toEqual(
      new Set<IntakeQuestion>([
        'first_name',
        'last_name',
        'preferred_language',
        'document',
        'phone',
      ]),
    );
  });
});

describe('a required list staff chose (RAPP-611)', () => {
  const sizesOptional = new Set<IntakeQuestion>(['first_name', 'last_name', 'phone']);
  test("Don't ask follows it", () => {
    expect(canSkipQuestion('clothing_size', answered(), sizesOptional)).toBe(true);
    expect(canSkipQuestion('phone', answered(), sizesOptional)).toBe(false);
    expect(canSkipQuestion('preferred_language', answered(), new Set())).toBe(false);
  });
  test('a skipped question made required is asked after all', () => {
    expect(questionsToAsk(answered(), { phone: 'skip' }, sizesOptional).has('phone')).toBe(true);
  });
});

describe('questionsToAsk', () => {
  test('Auto asks only what nobody answered', () => {
    const asked = questionsToAsk(answered('first_name', 'last_name'), {});
    expect(asked.has('first_name')).toBe(false);
    expect(asked.has('nationality')).toBe(true);
  });

  test('Ask asks a question staff answered', () => {
    expect(questionsToAsk(answered('nationality'), { nationality: 'ask' }).has('nationality')).toBe(
      true,
    );
  });

  test("Don't ask never asks, answered or not", () => {
    expect(questionsToAsk(answered(), { phone: 'skip' }).has('phone')).toBe(false);
  });

  test("Don't ask on a required question whose answer was cleared still asks it", () => {
    expect(questionsToAsk(answered(), { nationality: 'skip' }).has('nationality')).toBe(true);
  });

  test('the avatar is never asked: it is on no wizard screen', () => {
    expect(questionsToAsk(answered(), {}).has('avatar')).toBe(false);
    expect(WIZARD_QUESTIONS).not.toContain('avatar');
  });
});

describe('canSkipQuestion', () => {
  test('a required question needs an answer first', () => {
    expect(canSkipQuestion('nationality', answered())).toBe(false);
    expect(canSkipQuestion('nationality', answered('nationality'))).toBe(true);
  });

  test('an optional question can always be hidden', () => {
    expect(canSkipQuestion('phone', answered())).toBe(true);
    expect(canSkipQuestion('document', answered())).toBe(true);
  });
});

describe('presets', () => {
  test('"Only what is missing" is all Auto', () => {
    expect(INTAKE_STATE_PRESETS.missing).toEqual({});
  });

  test('"She reviews everything" asks every wizard question', () => {
    const review = INTAKE_STATE_PRESETS.review;
    expect(Object.keys(review).sort()).toEqual([...WIZARD_QUESTIONS].sort());
    expect(new Set(Object.values(review))).toEqual(new Set(['ask']));
  });
});

describe('questionStateChanges', () => {
  test('sends only what changed, with Auto for a removed state', () => {
    expect(
      questionStateChanges(
        { phone: 'skip', nationality: 'ask' },
        { nationality: 'ask', city: 'ask' },
      ),
    ).toEqual({ phone: 'auto', city: 'ask' });
  });
});

describe('questionStatesSchema', () => {
  test('reads rows into a map and drops questions this build does not know', () => {
    expect(
      questionStatesSchema.parse([
        { question: 'phone', state: 'skip' },
        { question: 'future_question', state: 'ask' },
      ]),
    ).toEqual({ phone: 'skip' });
  });
});

function clientReturning(result: { data: unknown; error: unknown }) {
  const calls: unknown[] = [];
  const client = {
    rpc: (name: string, args?: unknown) => {
      calls.push(args === undefined ? [name] : [name, args]);
      return Promise.resolve(result);
    },
  };
  return { client: client as never, calls };
}

describe('actions', () => {
  test('she reads only the questions to ask', async () => {
    const { client, calls } = clientReturning({ data: ['phone', 'nationality'], error: null });
    expect(await fetchMyQuestionsToAsk(client)).toEqual(new Set(['phone', 'nationality']));
    expect(calls).toEqual([['my_questions_to_ask']]);
  });

  test('staff read her states', async () => {
    const { client, calls } = clientReturning({
      data: [{ question: 'phone', state: 'skip' }],
      error: null,
    });
    expect(await fetchParticipantQuestionStates(client, 'p1')).toEqual({ phone: 'skip' });
    expect(calls).toEqual([['participant_question_states', { p_profile_id: 'p1' }]]);
  });

  test('staff save the changes', async () => {
    const { client, calls } = clientReturning({ data: null, error: null });
    await saveParticipantQuestionStates(client, 'p1', { phone: 'auto' });
    expect(calls).toEqual([
      ['set_intake_question_states', { p_profile_id: 'p1', p_states: { phone: 'auto' } }],
    ]);
  });

  test('a failed read is a typed DB-1 error', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'boom' } });
    await expect(fetchMyQuestionsToAsk(client)).rejects.toMatchObject({ code: 'DB-1' });
  });
});
