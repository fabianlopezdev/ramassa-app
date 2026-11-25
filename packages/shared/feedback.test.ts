import { describe, expect, test } from 'bun:test';
import {
  createFeedbackSubmission,
  FEEDBACK_MESSAGE_SCREEN,
  feedbackAnswerQuestion,
  feedbackFormCatalog,
  feedbackSubmissionSchema,
  feedbackTransitionSchema,
  fetchMyFeedbackForm,
  fetchStaffFeedbackSubmissions,
  getFeedbackConversationPath,
  sendFeedbackSubmission,
  transitionFeedbackSubmission,
} from './feedback';
import { answerText } from './intake-builder/builder';
import { customFormById, customFormScreenQuestions } from './intake-builder/custom-forms';

describe('feedback submission contract', () => {
  test('normalizes the four controlled types and optional private image key', () => {
    expect(
      feedbackSubmissionSchema.parse({
        type: 'activity_proposal',
        content: '  Organitzeu una activitat de conversa.  ',
        imageObjectKey:
          '5eed0000-0000-4000-8000-000000000001/feedback/5eed0000-0000-4000-8000-000000000012/2026/08/0123456789abcdef0123456789abcdef.jpg',
      }),
    ).toEqual({
      type: 'activity_proposal',
      content: 'Organitzeu una activitat de conversa.',
      imageObjectKey:
        '5eed0000-0000-4000-8000-000000000001/feedback/5eed0000-0000-4000-8000-000000000012/2026/08/0123456789abcdef0123456789abcdef.jpg',
    });

    for (const type of ['activity_proposal', 'idea', 'problem', 'general'] as const) {
      expect(feedbackSubmissionSchema.safeParse({ type, content: 'Missatge' }).success).toBe(true);
    }
  });

  test('rejects unknown types, blank content, oversized content, and unrelated object keys', () => {
    expect(
      feedbackSubmissionSchema.safeParse({ type: 'complaint', content: 'Missatge' }).success,
    ).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({ type: 'general', content: '   ' }).success).toBe(
      false,
    );
    expect(
      feedbackSubmissionSchema.safeParse({ type: 'general', content: 'x'.repeat(2001) }).success,
    ).toBe(false);
    expect(
      feedbackSubmissionSchema.safeParse({
        type: 'general',
        content: 'Missatge',
        imageObjectKey: 'https://public.example/image.jpg',
      }).success,
    ).toBe(false);
  });

  test('allows only the staff state vocabulary', () => {
    for (const status of ['new', 'read', 'in_progress', 'resolved'] as const) {
      expect(
        feedbackTransitionSchema.safeParse({ submissionId: crypto.randomUUID(), status }).success,
      ).toBe(true);
    }
    expect(
      feedbackTransitionSchema.safeParse({ submissionId: crypto.randomUUID(), status: 'deleted' })
        .success,
    ).toBe(false);
  });
});

test('create sends only the typed feedback RPC payload', async () => {
  let rpcName: string | undefined;
  let rpcArgs: unknown;
  const rpc = async (name: string, args: unknown) => {
    rpcName = name;
    rpcArgs = args;
    return { data: '5eed0000-0000-4000-8999-000000000001', error: null };
  };

  await createFeedbackSubmission(
    { rpc } as never,
    feedbackSubmissionSchema.parse({ type: 'idea', content: '  Club de lectura  ' }),
  );

  expect(rpcName).toBe('create_feedback_submission');
  expect(rpcArgs).toEqual({ p_type: 'idea', p_content: 'Club de lectura', p_image_url: null });
});

test('transition uses the state RPC and chat uses the existing conversation route', async () => {
  let rpcArgs: unknown;
  const rpc = async (_name: string, args: unknown) => {
    rpcArgs = args;
    return { data: null, error: null };
  };
  const submissionId = '5eed0000-0000-4000-8999-000000000001';
  await transitionFeedbackSubmission({ rpc } as never, { submissionId, status: 'in_progress' });
  expect(rpcArgs).toEqual({ p_submission_id: submissionId, p_status: 'in_progress' });
  expect(getFeedbackConversationPath('5eed0000-0000-4000-8999-000000000002')).toBe(
    '/messages/5eed0000-0000-4000-8999-000000000002',
  );
});

// The suggestions form on the form engine (RAPP-939) ----------------------------------------------

const FORM = '93900000-0000-4000-8000-0000000000f1';
const FIXED_SCREEN = '93900000-0000-4000-8000-0000000000a1';
const SECOND_SCREEN = '93900000-0000-4000-8000-0000000000a2';
const RATING = '93900000-0000-4000-8000-0000000000b1';
const CHOICE = '93900000-0000-4000-8000-0000000000b2';
const OPTION = '93900000-0000-4000-8000-0000000000c1';

// The form as `my_feedback_form` sends it: the fixed screen first, then a screen staff added.
const FORM_ROW = {
  form_id: FORM,
  name: { ca: 'Formulari de suggeriments' },
  content: {
    schema: 2,
    kind: 'other',
    name: { ca: 'Formulari de suggeriments' },
    screens: [
      {
        id: FIXED_SCREEN,
        title: { ca: 'Nou suggeriment' },
        intro: null,
        sort_order: 0,
        texts: {},
        system_screen: 'feedback_message',
      },
      { id: SECOND_SCREEN, title: { ca: 'Una mica més' }, intro: null, sort_order: 1, texts: {} },
    ],
    placements: [
      {
        id: '93900000-0000-4000-8000-0000000000d1',
        field_id: CHOICE,
        screen_key: FIXED_SCREEN,
        sort_order: 0,
        required: false,
        label_override: null,
        help_override: null,
        field: {
          label: { ca: 'On?' },
          help: null,
          options: [{ id: OPTION, key: null, label: { ca: 'Al camp' }, sort_order: 0 }],
          settings: {},
          question_type: 'single_choice',
        },
      },
      {
        id: '93900000-0000-4000-8000-0000000000d2',
        field_id: RATING,
        screen_key: SECOND_SCREEN,
        sort_order: 0,
        required: true,
        label_override: null,
        help_override: null,
        field: {
          label: { ca: "Com t'ho passes?" },
          help: null,
          options: [],
          settings: {},
          question_type: 'rating',
        },
      },
    ],
  },
};

describe('the suggestions form on her phone (RAPP-939)', () => {
  test('her phone reads the form; a server before it sends none', async () => {
    const form = await fetchMyFeedbackForm({
      rpc: async () => ({ data: FORM_ROW, error: null }),
    } as never);
    expect(form?.formId).toBe(FORM);
    expect(
      await fetchMyFeedbackForm({
        rpc: async () => ({ data: null, error: null }),
      } as never),
    ).toBeNull();
  });

  test('her phone walks the form: the fixed screen first, then the questions staff added', async () => {
    const form = await fetchMyFeedbackForm({
      rpc: async () => ({ data: FORM_ROW, error: null }),
    } as never);
    if (form === null) throw new Error('the form did not parse');
    const catalog = feedbackFormCatalog(
      { screens: [], overrides: [], presets: [], sections: [], fields: [], placements: [] },
      form,
    );
    const walked = customFormById(catalog, FORM);
    expect(walked?.systemKey).toBe('feedback');
    expect(walked?.screens.map((screen) => screen.systemScreen ?? null)).toEqual([
      FEEDBACK_MESSAGE_SCREEN,
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

  test('a suggestion goes with her answers, by question', async () => {
    let rpcName: string | undefined;
    let rpcArgs: unknown;
    const rpc = async (name: string, args: unknown) => {
      rpcName = name;
      rpcArgs = args;
      return { data: '5eed0000-0000-4000-8999-000000000001', error: null };
    };
    await sendFeedbackSubmission(
      { rpc } as never,
      feedbackSubmissionSchema.parse({ type: 'idea', content: ' Club de lectura ' }),
      { [RATING]: 4 },
    );
    expect(rpcName).toBe('send_feedback_submission');
    expect(rpcArgs).toEqual({
      p_type: 'idea',
      p_content: 'Club de lectura',
      p_image_url: null,
      p_answers: { [RATING]: 4 },
    });
  });
});

describe('the inbox reads her answers (RAPP-939)', () => {
  const row = {
    id: '5eed0000-0000-4000-8999-000000000001',
    type: 'idea',
    content: 'Club de lectura',
    image_url: null,
    status: 'new',
    resolved_at: null,
    created_at: '2026-11-24T10:00:00.000Z',
    updated_at: '2026-11-24T10:00:00.000Z',
    author_id: '5eed0000-0000-4000-8999-000000000002',
    author_first_name: 'Jugadora',
    author_last_name: 'Prova',
    resolved_by: null,
    conversation_id: '5eed0000-0000-4000-8999-000000000003',
  };

  test('each answer comes with its question as she read it, read in words', async () => {
    const [submission] = await fetchStaffFeedbackSubmissions({
      rpc: async () => ({
        data: [
          {
            ...row,
            answers: [
              {
                field_id: CHOICE,
                question: {
                  label: { ca: 'On?' },
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
    expect(submission?.answers.map((answer) => answer.fieldId)).toEqual([CHOICE]);
    const [answer] = submission?.answers ?? [];
    if (answer === undefined) throw new Error('no answer');
    expect(
      answerText(feedbackAnswerQuestion(answer), answer.value as string, 'ca', {
        yes: 'Sí',
        no: 'No',
        maybe: 'Potser',
        archived: 'Arxivada',
      }),
    ).toBe('Al camp');
  });

  test('a server before them sends no answers: the list is empty', async () => {
    const [submission] = await fetchStaffFeedbackSubmissions({
      rpc: async () => ({ data: [row], error: null }),
    } as never);
    expect(submission?.answers).toEqual([]);
  });
});
