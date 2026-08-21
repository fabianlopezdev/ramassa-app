import { describe, expect, test } from 'bun:test';
import {
  createFeedbackSubmission,
  feedbackSubmissionSchema,
  feedbackTransitionSchema,
  getFeedbackConversationPath,
  transitionFeedbackSubmission,
} from './feedback';

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
