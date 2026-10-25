/**
 * Who answered the app's own questions (RAPP-653): the RPC argument name is
 * asserted, since no type checker crosses the SQL boundary, and a failed read
 * throws instead of looking like no answers at all.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'bun:test';
import { AppError } from '../errors';
import type { Database } from '../types/database';
import { fetchParticipantProfileAnswers } from './answer-sources';

type Client = SupabaseClient<Database>;

function clientReturning(result: { data: unknown; error: { message: string } | null }) {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve(result);
    },
  } as unknown as Client;
  return { client, calls };
}

test('reads who answered each question, by the profile id', async () => {
  const { client, calls } = clientReturning({
    data: [
      {
        field_id: '00000000-0000-4000-8000-000000000001',
        question: 'city',
        source: 'staff',
        answered_at: '2026-10-20T09:00:00Z',
        answered_by_name: 'Marta Puig',
      },
      {
        // A split question: the latest of its parts is her question's origin.
        field_id: '00000000-0000-4000-8000-000000000002',
        question: 'phone',
        source: 'entity',
        answered_at: '2026-10-01T09:00:00Z',
        answered_by_name: 'Creu Roja',
      },
      {
        // A field the team added has no app question.
        field_id: '00000000-0000-4000-8000-000000000003',
        question: null,
        source: 'staff',
        answered_at: '2026-10-21T09:00:00Z',
        answered_by_name: 'Marta Puig',
      },
      {
        field_id: '00000000-0000-4000-8000-000000000004',
        question: 'phone',
        source: 'player',
        answered_at: '2026-10-12T09:00:00Z',
        answered_by_name: null,
      },
    ],
    error: null,
  });
  const rows = await fetchParticipantProfileAnswers(client, 'p1');
  expect(calls).toEqual([{ name: 'participant_profile_answers', args: { p_profile_id: 'p1' } }]);
  expect(rows).toEqual([
    {
      question: 'city',
      source: 'staff',
      answeredAt: '2026-10-20T09:00:00Z',
      answeredByName: 'Marta Puig',
    },
    {
      question: 'phone',
      source: 'player',
      answeredAt: '2026-10-12T09:00:00Z',
      answeredByName: null,
    },
  ]);
});

test('a failed read throws', async () => {
  const { client } = clientReturning({ data: null, error: { message: 'denied' } });
  await expect(fetchParticipantProfileAnswers(client, 'p1')).rejects.toBeInstanceOf(AppError);
});
