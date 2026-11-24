import { describe, expect, test } from 'bun:test';
import {
  eventSignupFormCatalog,
  fetchEventSignupAnswers,
  fetchEventSignupForm,
  fetchEventSignupFormSource,
  openEventSignupForm,
  signUpForEvent,
} from './event-signup-form';
import { answerText } from './intake-builder/builder';
import { parseCustomForms } from './intake-builder/custom-form-model';
import { customFormById, customFormScreenQuestions } from './intake-builder/custom-forms';
import { formAnswerQuestion } from './on-demand-form';

const EVENT = '94100000-0000-4000-8002-000000000001';
const FORM = '94100000-0000-4000-8000-0000000000a1';
const SCREEN = '94100000-0000-4000-8000-0000000000a2';
const BUS = '94100000-0000-4000-8000-0000000000b1';
const YES = '94100000-0000-4000-8000-0000000000c1';
const NO = '94100000-0000-4000-8000-0000000000c2';
const SIGNUP = '94100000-0000-4000-8999-000000000001';
const PLAYER = '94100000-0000-4000-8000-000000000002';

// What `event_signup_form(activity)` sends: the form, its screens in order and its questions.
const FORM_ROW = {
  form_id: FORM,
  event_id: EVENT,
  name: { ca: 'Preguntes de la inscripció' },
  content: {
    name: { ca: 'Preguntes de la inscripció' },
    kind: 'signup',
    screens: [{ id: SCREEN, title: { ca: 'Transport' }, intro: null, sort_order: 0, texts: {} }],
    placements: [
      {
        id: '94100000-0000-4000-8000-0000000000d1',
        field_id: BUS,
        screen_key: SCREEN,
        sort_order: 0,
        required: true,
        label_override: null,
        help_override: null,
        field: {
          label: { ca: 'Necessites seient al bus?' },
          help: null,
          settings: {},
          question_type: 'single_choice',
          options: [
            { id: YES, key: null, label: { ca: 'Sí' }, sort_order: 0 },
            { id: NO, key: null, label: { ca: 'No' }, sort_order: 1 },
          ],
        },
      },
    ],
  },
};

type Call = { readonly name: string; readonly args: unknown };

function recordingClient(reply: (name: string) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const rpc = (name: string, args: unknown) => {
    calls.push({ name, args });
    const result = Promise.resolve(reply(name));
    return Object.assign(result, { abortSignal: () => result });
  };
  return { client: { rpc } as never, calls };
}

describe('the sign-up form on her phone (RAPP-941)', () => {
  test('her phone reads the activity form from its own call; an activity that asks nothing sends none', async () => {
    const asks = recordingClient(() => ({ data: FORM_ROW, error: null }));
    const form = await fetchEventSignupForm(asks.client, EVENT);
    expect(asks.calls).toEqual([{ name: 'event_signup_form', args: { p_event_id: EVENT } }]);
    expect(form).toEqual({
      formId: FORM,
      eventId: EVENT,
      name: FORM_ROW.name,
      content: FORM_ROW.content,
    });
    const silent = recordingClient(() => ({ data: null, error: null }));
    expect(await fetchEventSignupForm(silent.client, EVENT)).toBeNull();
  });

  test('a refusal from the database is a typed error', async () => {
    const refused = recordingClient(() => ({ data: null, error: { message: 'EVENTS/NOT_FOUND' } }));
    await expect(fetchEventSignupForm(refused.client, EVENT)).rejects.toMatchObject({
      code: 'DB-1',
    });
  });

  test('her phone walks the form over the catalog an installed build reads', async () => {
    const source = await fetchEventSignupFormSource(
      recordingClient((name) => ({
        data:
          name === 'intake_catalog'
            ? { screens: [], overrides: [], presets: [], sections: [], fields: [], placements: [] }
            : FORM_ROW,
        error: null,
      })).client,
      EVENT,
    );
    if (source.form === null) throw new Error('the form did not parse');
    const catalog = eventSignupFormCatalog(source.raw, source.form);
    const walked = customFormById(catalog, FORM);
    expect(walked?.kind).toBe('signup');
    expect(walked?.eventId).toBe(EVENT);
    expect(
      customFormScreenQuestions(catalog, SCREEN).map((question) => [
        question.id,
        question.type,
        question.isRequired,
      ]),
    ).toEqual([[BUS, 'single_choice', true]]);
  });

  test('she signs up with her answers, by question; the sign-up comes back as her own write returns it', async () => {
    const signup = { id: SIGNUP, state: 'confirmed', updated_at: '2026-11-24T10:00:00.000Z' };
    const sent = recordingClient(() => ({ data: signup, error: null }));
    expect(await signUpForEvent(sent.client, EVENT, { [BUS]: YES })).toEqual(signup);
    expect(sent.calls).toEqual([
      { name: 'sign_up_for_event', args: { p_event_id: EVENT, p_answers: { [BUS]: YES } } },
    ]);
  });

  test('a full activity fails as her own write fails', async () => {
    const full = recordingClient(() => ({
      data: null,
      error: { message: 'EVENTS/CAPACITY_FULL' },
    }));
    await expect(signUpForEvent(full.client, EVENT, {})).rejects.toMatchObject({
      code: 'EVENTS-1',
    });
    const missing = recordingClient(() => ({
      data: null,
      error: { message: 'a required question has no answer' },
    }));
    await expect(signUpForEvent(missing.client, EVENT, {})).rejects.toMatchObject({
      code: 'DB-1',
    });
  });
});

describe('staff read her answers (RAPP-941)', () => {
  const row = {
    signup_id: SIGNUP,
    player_id: PLAYER,
    first_name: 'Jugadora',
    last_name: 'Prova',
    state: 'confirmed',
    created_at: '2026-11-24T10:00:00.000Z',
    updated_at: '2026-11-24T10:05:00.000Z',
    answers: [
      {
        field_id: BUS,
        question: {
          label: { ca: 'Necessites seient al bus?' },
          help: null,
          question_type: 'single_choice',
          settings: {},
          options: [
            { id: YES, label: { ca: 'Sí' } },
            { id: NO, label: { ca: 'No' } },
          ],
        },
        value: YES,
      },
      { field_id: 'not-a-question', question: {}, value: 1 },
    ],
  };

  test('each sign-up comes with her answers, each under its question as she read it', async () => {
    const reads = recordingClient(() => ({ data: [row], error: null }));
    const [signup] = await fetchEventSignupAnswers(reads.client, EVENT);
    expect(reads.calls).toEqual([{ name: 'event_signup_answers', args: { p_event_id: EVENT } }]);
    expect(signup?.firstName).toBe('Jugadora');
    expect(signup?.state).toBe('confirmed');
    // An answer this build cannot read is left out.
    expect(signup?.answers).toHaveLength(1);
    const answer = signup?.answers[0];
    if (answer === undefined) throw new Error('no answer');
    expect(answerText(formAnswerQuestion(answer), answer.value as never, 'ca', {} as never)).toBe(
      'Sí',
    );
  });

  test('a sign-up from an installed build has no answers', async () => {
    const reads = recordingClient(() => ({ data: [{ ...row, answers: [] }], error: null }));
    expect((await fetchEventSignupAnswers(reads.client, EVENT))[0]?.answers).toEqual([]);
  });

  test('the activity editor opens the form by its activity', async () => {
    const opens = recordingClient(() => ({ data: FORM, error: null }));
    expect(await openEventSignupForm(opens.client, EVENT)).toBe(FORM);
    expect(opens.calls).toEqual([{ name: 'open_event_signup_form', args: { p_event_id: EVENT } }]);
  });
});

describe('the dashboard catalog names a sign-up form activity (RAPP-941)', () => {
  test('a sign-up form reads its kind and activity title; another form has none', () => {
    const base = {
      name: { ca: 'Preguntes de la inscripció' },
      filled_by: 'player',
      mandatory: 'optional',
      deadline: null,
      audience: 'all',
      repeats_each_season: false,
      system_key: null,
      version: 1,
      published_at: null,
      is_archived: false,
      screens: [],
    };
    const [signup, other] = parseCustomForms([
      {
        ...base,
        id: FORM,
        kind: 'signup',
        event_id: EVENT,
        event_title: { ca: 'Sortida a la platja' },
      },
      { ...base, id: SCREEN, kind: 'other' },
    ]);
    expect(signup?.kind).toBe('signup');
    expect(signup?.eventTitle).toEqual({ ca: 'Sortida a la platja' });
    expect(other?.eventTitle).toBeNull();
  });
});
