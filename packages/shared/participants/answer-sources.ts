/**
 * Who gave each answer on her page, and when (RAPP-653): she did, an entity
 * did (named by the entity), or a team member did (named by her). The values
 * of the app's own fields come with her record; this reads only where they
 * came from. The database leaves out the fields the reader may not read.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import type { Database } from '../types/database';

export const ANSWER_SOURCES = ['player', 'entity', 'staff'] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

/** Where one answer came from. */
export interface AnswerOrigin {
  readonly source: AnswerSource;
  readonly answeredAt: string;
  /** The team member's name, or the entity's; null for hers or when unknown. */
  readonly answeredByName: string | null;
}

/** The origin of her answer to one of the app's own questions. */
export interface ProfileAnswerOrigin extends AnswerOrigin {
  /** The app's question, as `profile_answers` names it (`city`, `document`...). */
  readonly question: string;
}

const rowSchema = z.object({
  field_id: z.uuid(),
  // The app question the field belongs to; null for a field the team added.
  question: z.string().nullable(),
  source: z.enum(ANSWER_SOURCES),
  answered_at: z.string(),
  answered_by_name: z.string().nullable(),
});

/** Who answered each of the app's own questions for her, by the reader's levels. */
export async function fetchParticipantProfileAnswers(
  client: SupabaseClient<Database>,
  participantId: string,
): Promise<readonly ProfileAnswerOrigin[]> {
  const { data, error } = await client.rpc('participant_profile_answers', {
    p_profile_id: participantId,
  });
  if (error) throw new AppError('DB-1', { message: error.message });
  // One origin per app question (RAPP-662 reads them per field): the latest
  // answer among its fields, as `profile_answers` kept one row per question.
  const latest = new Map<string, ProfileAnswerOrigin>();
  for (const row of z.array(rowSchema).parse(data ?? [])) {
    if (row.question === null) continue;
    const known = latest.get(row.question);
    if (known !== undefined && known.answeredAt >= row.answered_at) continue;
    latest.set(row.question, {
      question: row.question,
      source: row.source,
      answeredAt: row.answered_at,
      answeredByName: row.answered_by_name,
    });
  }
  return [...latest.values()].sort((a, b) => a.question.localeCompare(b.question));
}
