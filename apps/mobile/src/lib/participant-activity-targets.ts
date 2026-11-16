/**
 * What an entry on her activity timeline opens (X5), for a reader who may
 * open it. `participant_activity()` returns each entry's own id, so the
 * session, conversation or activity behind it is read on tap, through reads
 * the reader's permissions already allow. Entries with no target, or a target
 * the reader may not open, open nothing.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Href } from 'expo-router';
import type { Database } from '@ramassa/shared';
import { AppError } from '@ramassa/shared/errors';
import type { ParticipantActivityKind } from '@ramassa/shared/participants';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { teamScreens } from './account-area';

export type ActivityTarget = 'attendance-sheet' | 'conversation' | 'event' | 'feedback-inbox';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function activityTarget(
  kind: ParticipantActivityKind,
  permissions: ReadonlySet<PermissionCode>,
): ActivityTarget | null {
  const screens = teamScreens(permissions);
  if (kind === 'attendance') return screens.attendance ? 'attendance-sheet' : null;
  if (kind === 'message') return screens.messages ? 'conversation' : null;
  if (kind === 'event_signup') return screens.events ? 'event' : null;
  if (kind === 'feedback') return screens.feedback ? 'feedback-inbox' : null;
  return null;
}

export function activityTargetRoute(target: ActivityTarget, targetId: string | null): Href | null {
  // The inbox takes no item: it opens with every submission listed.
  if (target === 'feedback-inbox') return '/team-feedback' as Href;
  if (targetId === null || !uuidPattern.test(targetId)) return null;
  if (target === 'attendance-sheet') return `/attendance/${targetId}` as Href;
  if (target === 'conversation') return `/messages/${targetId}` as Href;
  return `/content-event/${targetId}` as Href;
}

function readFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

/** The id the target's route needs, or null when there is none to read. */
export async function resolveActivityTargetId(
  client: SupabaseClient<Database>,
  target: ActivityTarget,
  entryId: string,
  participantId: string,
): Promise<string | null> {
  if (target === 'attendance-sheet') {
    const { data, error } = await client
      .from('attendance')
      .select('occurrence_id')
      .eq('id', entryId)
      .maybeSingle();
    if (error !== null) readFailure(error.message);
    return data?.occurrence_id ?? null;
  }
  if (target === 'conversation') {
    // One conversation per woman (conversations_user_unique).
    const { data, error } = await client
      .from('conversations')
      .select('id')
      .eq('user_id', participantId)
      .maybeSingle();
    if (error !== null) readFailure(error.message);
    return data?.id ?? null;
  }
  if (target === 'event') {
    const { data, error } = await client
      .from('event_signups')
      .select('event_id')
      .eq('id', entryId)
      .maybeSingle();
    if (error !== null) readFailure(error.message);
    return data?.event_id ?? null;
  }
  return null;
}
