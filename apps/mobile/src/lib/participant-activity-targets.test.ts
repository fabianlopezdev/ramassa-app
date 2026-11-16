import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test } from 'bun:test';
import type { Href } from 'expo-router';
import type { Database } from '@ramassa/shared';
import type { ParticipantActivityKind } from '@ramassa/shared/participants';
import type { PermissionCode } from '@ramassa/shared/permissions';
import {
  activityTarget,
  activityTargetRoute,
  resolveActivityTargetId,
  type ActivityTarget,
} from './participant-activity-targets';

const ENTRY_ID = '80000000-0000-4000-8000-000000000001';
const PARTICIPANT_ID = '60000000-0000-4000-8000-000000000001';
const TARGET_ID = '90000000-0000-4000-8000-000000000001';

const can = (...codes: readonly PermissionCode[]) => new Set<PermissionCode>(codes);

describe('what a timeline entry opens (X5)', () => {
  test.each<[ParticipantActivityKind, PermissionCode, ActivityTarget]>([
    ['attendance', 'attendance.mark', 'attendance-sheet'],
    ['attendance', 'attendance.reports', 'attendance-sheet'],
    ['message', 'messages.inbox', 'conversation'],
    ['event_signup', 'events.edit', 'event'],
    ['feedback', 'feedback.view', 'feedback-inbox'],
  ])('%s opens for a reader with %s', (kind, permission, target) => {
    expect(activityTarget(kind, can(permission))).toBe(target);
  });

  test.each<ParticipantActivityKind>(['attendance', 'message', 'event_signup', 'feedback'])(
    '%s does not open for a reader without its permission',
    (kind) => {
      expect(activityTarget(kind, can('participants.view'))).toBeNull();
    },
  );

  test.each<ParticipantActivityKind>([
    'forum_post',
    'equipment',
    'service_interest',
    'referral_update',
  ])('%s has no target to open', (kind) => {
    expect(
      activityTarget(
        kind,
        can('participants.view', 'forum.moderate', 'equipment.handover', 'services.edit'),
      ),
    ).toBeNull();
  });
});

describe('the route of a target', () => {
  test('needs the looked-up id, except the feedback inbox', () => {
    expect(activityTargetRoute('attendance-sheet', TARGET_ID)).toBe(
      `/attendance/${TARGET_ID}` as Href,
    );
    expect(activityTargetRoute('conversation', TARGET_ID)).toBe(`/messages/${TARGET_ID}` as Href);
    expect(activityTargetRoute('event', TARGET_ID)).toBe(`/content-event/${TARGET_ID}` as Href);
    expect(activityTargetRoute('feedback-inbox', null)).toBe('/team-feedback' as Href);
    expect(activityTargetRoute('attendance-sheet', null)).toBeNull();
    expect(activityTargetRoute('event', '../profile')).toBeNull();
  });
});

function fakeClient(row: Record<string, unknown> | null) {
  const reads: string[] = [];
  const fake = {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => {
            reads.push(`${table}.${columns} where ${column}=${value}`);
            return Promise.resolve({ data: row, error: null });
          },
        }),
      }),
    }),
  };
  return { client: fake as unknown as SupabaseClient<Database>, reads };
}

describe('the id a target needs, read on tap', () => {
  test('an attendance mark gives its session', async () => {
    const { client, reads } = fakeClient({ occurrence_id: TARGET_ID });
    expect(
      await resolveActivityTargetId(client, 'attendance-sheet', ENTRY_ID, PARTICIPANT_ID),
    ).toBe(TARGET_ID);
    expect(reads).toEqual([`attendance.occurrence_id where id=${ENTRY_ID}`]);
  });

  test('a message gives her conversation', async () => {
    const { client, reads } = fakeClient({ id: TARGET_ID });
    expect(await resolveActivityTargetId(client, 'conversation', ENTRY_ID, PARTICIPANT_ID)).toBe(
      TARGET_ID,
    );
    expect(reads).toEqual([`conversations.id where user_id=${PARTICIPANT_ID}`]);
  });

  test('a sign-up gives its activity', async () => {
    const { client, reads } = fakeClient({ event_id: TARGET_ID });
    expect(await resolveActivityTargetId(client, 'event', ENTRY_ID, PARTICIPANT_ID)).toBe(
      TARGET_ID,
    );
    expect(reads).toEqual([`event_signups.event_id where id=${ENTRY_ID}`]);
  });

  test('the feedback inbox needs no read', async () => {
    const { client, reads } = fakeClient(null);
    expect(
      await resolveActivityTargetId(client, 'feedback-inbox', ENTRY_ID, PARTICIPANT_ID),
    ).toBeNull();
    expect(reads).toEqual([]);
  });
});
