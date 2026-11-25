import { describe, expect, test } from 'bun:test';
import { answerText } from './intake-builder/builder';
import { customFormById, customFormScreenQuestions } from './intake-builder/custom-forms';
import {
  createMentoringRequest,
  fetchMyMentoringForm,
  fetchMyMentoringFormSource,
  fetchStaffMentoringRequests,
  getPrivateMentoringCalendarEntries,
  MENTORING_REQUEST_SCREEN,
  mentoringFormCatalog,
  mentoringRequestSchema,
  scheduleMentoringRequest,
  sendMentoringRequest,
  summarizeMentoringTopics,
} from './mentoring';
import { formAnswerQuestion } from './on-demand-form';

describe('mentoring request contract', () => {
  test('normalizes a controlled topic, private note, and preferred slot', () => {
    expect(
      mentoringRequestSchema.parse({
        topic: 'gender_violence',
        topicDetail: '  Necessito parlar amb algú.  ',
        preferredDate: '2026-08-28',
        preferredTime: '10:30',
      }),
    ).toEqual({
      topic: 'gender_violence',
      topicDetail: 'Necessito parlar amb algú.',
      preferredDate: '2026-08-28',
      preferredTime: '10:30',
    });
  });

  test('rejects free-form topics, malformed slots, and oversized private notes', () => {
    expect(
      mentoringRequestSchema.safeParse({
        topic: 'custom_sensitive_bucket',
        topicDetail: 'x'.repeat(2001),
        preferredDate: null,
        preferredTime: '10:30',
      }).success,
    ).toBe(false);
  });

  test('sends only the typed request RPC payload', async () => {
    let rpcName: string | undefined;
    let rpcArgs: unknown;
    const rpc = async (name: string, args: unknown) => {
      rpcName = name;
      rpcArgs = args;
      return { data: '5eed0000-0000-4000-8999-000000000001', error: null };
    };

    const id = await createMentoringRequest(
      { rpc } as never,
      mentoringRequestSchema.parse({
        topic: 'labor_orientation',
        topicDetail: '',
        preferredDate: null,
        preferredTime: null,
      }),
    );

    expect(id).toBe('5eed0000-0000-4000-8999-000000000001');
    expect(rpcName).toBe('create_mentoring_request');
    expect(rpcArgs).toEqual({
      p_topic: 'labor_orientation',
      p_topic_detail: null,
      p_preferred_date: null,
      p_preferred_time: null,
    });
  });
});

test('topic summary preserves the controlled vocabulary and counts', () => {
  expect(
    summarizeMentoringTopics([
      { topic: 'labor_orientation' },
      { topic: 'gender_violence' },
      { topic: 'labor_orientation' },
    ]),
  ).toEqual([
    { topic: 'labor_orientation', count: 2 },
    { topic: 'gender_violence', count: 1 },
  ]);
});

test('private calendar entries expose only the appointment state and schedule', () => {
  const entries = getPrivateMentoringCalendarEntries([
    {
      id: '5eed0000-0000-4000-8999-000000000001',
      topic: 'gender_violence',
      topicDetail: 'Necessito parlar amb algú.',
      preferredDate: '2026-08-28',
      preferredTime: '10:30',
      status: 'scheduled',
      scheduledAt: '2026-08-29T10:30:00.000Z',
      assignedStaffName: 'Aina Serra',
      completedAt: null,
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T11:00:00.000Z',
    },
  ]);

  expect(entries).toEqual([
    {
      id: '5eed0000-0000-4000-8999-000000000001',
      status: 'scheduled',
      scheduledAt: '2026-08-29T10:30:00.000Z',
      assignedStaffName: 'Aina Serra',
    },
  ]);
  expect(JSON.stringify(entries)).not.toContain('gender_violence');
  expect(JSON.stringify(entries)).not.toContain('Necessito parlar');
});

test('staff scheduling sends only validated IDs, time, and private notes to the RPC', async () => {
  let rpcName: string | undefined;
  let rpcArgs: unknown;
  const rpc = async (name: string, args: unknown) => {
    rpcName = name;
    rpcArgs = args;
    return { data: null, error: null };
  };

  await scheduleMentoringRequest({ rpc } as never, {
    requestId: '5eed0000-0000-4000-8999-000000000001',
    scheduledAt: '2026-08-29T10:30:00.000Z',
    assignedStaffId: '5eed0000-0000-4000-8999-000000000002',
    staffNotes: '  Preparar una sala tranquil·la.  ',
  });

  expect(rpcName).toBe('schedule_mentoring_request');
  expect(rpcArgs).toEqual({
    p_request_id: '5eed0000-0000-4000-8999-000000000001',
    p_scheduled_at: '2026-08-29T10:30:00.000Z',
    p_assigned_staff_id: '5eed0000-0000-4000-8999-000000000002',
    p_staff_notes: 'Preparar una sala tranquil·la.',
  });
});

// The mentoring form on the form engine (RAPP-940) -------------------------------------------------

const FORM = '94000000-0000-4000-8000-0000000000f1';
const FIXED_SCREEN = '94000000-0000-4000-8000-0000000000a1';
const SECOND_SCREEN = '94000000-0000-4000-8000-0000000000a2';
const RATING = '94000000-0000-4000-8000-0000000000b1';
const CHOICE = '94000000-0000-4000-8000-0000000000b2';
const OPTION = '94000000-0000-4000-8000-0000000000c1';

// What `my_mentoring_form()` sends: the form, its screens in order and its questions.
const FORM_ROW = {
  form_id: FORM,
  name: { ca: 'Formulari de mentoria' },
  content: {
    name: { ca: 'Formulari de mentoria' },
    screens: [
      {
        id: FIXED_SCREEN,
        title: { ca: 'Nova sol·licitud' },
        intro: null,
        sort_order: 0,
        texts: {},
        system_screen: 'mentoring_request',
      },
      {
        id: SECOND_SCREEN,
        title: { ca: 'Una mica més' },
        intro: null,
        sort_order: 1,
        texts: {},
        system_screen: null,
      },
    ],
    placements: [
      {
        id: '94000000-0000-4000-8000-0000000000d1',
        field_id: RATING,
        screen_key: SECOND_SCREEN,
        sort_order: 0,
        required: true,
        label_override: null,
        help_override: null,
        field: {
          label: { ca: 'Com et trobes?' },
          help: null,
          options: [],
          settings: {},
          question_type: 'rating',
        },
      },
    ],
  },
};

describe('the mentoring form on her phone (RAPP-940)', () => {
  test('her phone reads the form from its own call; a server before it sends none', async () => {
    let called: string | undefined;
    const form = await fetchMyMentoringForm({
      rpc: async (name: string) => {
        called = name;
        return { data: FORM_ROW, error: null };
      },
    } as never);
    expect(called).toBe('my_mentoring_form');
    expect(form?.formId).toBe(FORM);
    expect(
      await fetchMyMentoringForm({
        rpc: async () => ({ data: null, error: null }),
      } as never),
    ).toBeNull();
  });

  test('her phone walks the form: the fixed screen first, then the questions staff added', async () => {
    const source = await fetchMyMentoringFormSource({
      rpc: async (name: string) => ({
        data:
          name === 'intake_catalog'
            ? { screens: [], overrides: [], presets: [], sections: [], fields: [], placements: [] }
            : FORM_ROW,
        error: null,
      }),
    } as never);
    if (source.form === null) throw new Error('the form did not parse');
    const catalog = mentoringFormCatalog(source.raw, source.form);
    const walked = customFormById(catalog, FORM);
    expect(walked?.systemKey).toBe('mentoring');
    expect(walked?.screens.map((screen) => screen.systemScreen ?? null)).toEqual([
      MENTORING_REQUEST_SCREEN,
      null,
    ]);
    expect(
      customFormScreenQuestions(catalog, SECOND_SCREEN).map((question) => [
        question.id,
        question.type,
        question.isRequired,
      ]),
    ).toEqual([[RATING, 'rating', true]]);
  });

  test('a request goes with her answers, by question, its own parts checked as before', async () => {
    let rpcName: string | undefined;
    let rpcArgs: unknown;
    const rpc = async (name: string, args: unknown) => {
      rpcName = name;
      rpcArgs = args;
      return { data: '5eed0000-0000-4000-8999-000000000001', error: null };
    };
    await sendMentoringRequest(
      { rpc } as never,
      mentoringRequestSchema.parse({
        topic: 'empowerment',
        topicDetail: '  Vull parlar-ne  ',
        preferredDate: '2026-12-01',
        preferredTime: '17:30',
      }),
      { [RATING]: 4 },
    );
    expect(rpcName).toBe('send_mentoring_request');
    expect(rpcArgs).toEqual({
      p_topic: 'empowerment',
      p_topic_detail: 'Vull parlar-ne',
      p_preferred_date: '2026-12-01',
      p_preferred_time: '17:30',
      p_answers: { [RATING]: 4 },
    });
    await expect(
      sendMentoringRequest(
        { rpc } as never,
        { topic: 'other', topicDetail: null, preferredDate: null, preferredTime: '10:00' },
        {},
      ),
    ).rejects.toThrow();
  });
});

describe('the queue reads her answers (RAPP-940)', () => {
  const row = {
    id: '5eed0000-0000-4000-8999-000000000001',
    topic: 'gender_violence',
    topic_detail: 'Una nota privada',
    preferred_date: null,
    preferred_time: null,
    status: 'requested',
    scheduled_at: null,
    assigned_staff_name: null,
    completed_at: null,
    created_at: '2026-11-24T10:00:00.000Z',
    updated_at: '2026-11-24T10:00:00.000Z',
    player_id: '5eed0000-0000-4000-8999-000000000002',
    player_first_name: 'Jugadora',
    player_last_name: 'Prova',
    assigned_staff_id: null,
    staff_notes: null,
  };

  test('each answer comes with its question as she read it, read in words', async () => {
    const [request] = await fetchStaffMentoringRequests({
      rpc: async () => ({
        data: [
          {
            ...row,
            answers: [
              {
                field_id: CHOICE,
                question: {
                  label: { ca: 'On prefereixes?' },
                  help: null,
                  question_type: 'single_choice',
                  settings: {},
                  options: [{ id: OPTION, key: null, label: { ca: 'Al camp' }, sort_order: 0 }],
                },
                value: OPTION,
              },
              { field_id: 'not a question', question: {}, value: 1 },
            ],
          },
        ],
        error: null,
      }),
    } as never);
    expect(request?.answers.map((answer) => answer.fieldId)).toEqual([CHOICE]);
    const [answer] = request?.answers ?? [];
    if (answer === undefined) throw new Error('no answer');
    expect(
      answerText(formAnswerQuestion(answer), answer.value as string, 'ca', {
        yes: 'Sí',
        no: 'No',
        maybe: 'Potser',
        archived: 'Arxivada',
      }),
    ).toBe('Al camp');
  });

  test('a server before them sends no answers: the list is empty', async () => {
    const [request] = await fetchStaffMentoringRequests({
      rpc: async () => ({ data: [row], error: null }),
    } as never);
    expect(request?.answers).toEqual([]);
  });
});
