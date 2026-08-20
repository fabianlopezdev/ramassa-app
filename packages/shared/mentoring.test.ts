import { describe, expect, test } from 'bun:test';
import {
  createMentoringRequest,
  getPrivateMentoringCalendarEntries,
  mentoringRequestSchema,
  scheduleMentoringRequest,
  summarizeMentoringTopics,
} from './mentoring';

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
