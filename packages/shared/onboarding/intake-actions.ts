/**
 * The intake read the wizard needs besides her profile (RAPP-300): which
 * questions are already answered. Shaped like the profile actions, so a failed
 * read throws a typed `AppError` and never arrives as "nothing answered".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import { withCancellation, type CancellableRequest } from '../lib/cancellation';
import type { Database } from '../types/database';
import { answeredQuestionsSchema, type AnsweredQuestions } from './intake';

type Client = SupabaseClient<Database>;

/** Her own answered questions. The RPC takes no argument, so it reads only hers. */
export async function fetchMyAnsweredQuestions(
  client: Client,
  options: CancellableRequest = {},
): Promise<AnsweredQuestions> {
  const { data, error } = await withCancellation(client.rpc('my_answered_questions'), options);
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  return new Set(answeredQuestionsSchema.parse(data ?? []));
}
