import type { Href } from 'expo-router';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { teamScreens } from './account-area';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface PushDetailData {
  readonly contentType?: unknown;
  readonly contentId?: unknown;
}

/**
 * What the reader may open, for the team pushes (X4): her permissions, and the
 * screen she starts on, where a push lands when its target is not hers.
 */
export interface PushRouteAccess {
  readonly permissions: ReadonlySet<PermissionCode>;
  readonly start: Href;
}

export type PushDetailQueryRoot =
  | 'player-announcements'
  | 'player-events'
  | 'messaging'
  | 'player-mentoring'
  // A form the team created asks her (RAPP-700).
  | 'player-forms'
  // A report on the forum, for the moderators (X4).
  | 'forum-moderation'
  // An entity's update on a referral, for the referral's team member (X4).
  | 'participants';

export function pushDetailQueryRoot(contentType: unknown): PushDetailQueryRoot | null {
  if (contentType === 'announcement') return 'player-announcements';
  if (contentType === 'event') return 'player-events';
  if (contentType === 'message') return 'messaging';
  if (contentType === 'mentoring_update') return 'player-mentoring';
  if (contentType === 'custom_form') return 'player-forms';
  if (contentType === 'forum_flag') return 'forum-moderation';
  if (contentType === 'referral_update') return 'participants';
  return null;
}

export function resolvePushDetailRoute(data: unknown, access: PushRouteAccess): Href | null {
  if (data === null || typeof data !== 'object') return null;

  const { contentType, contentId } = data as PushDetailData;
  if (typeof contentId !== 'string' || !uuidPattern.test(contentId)) return null;
  if (contentType === 'announcement') return `/announcement/${contentId}` as Href;
  if (contentType === 'event') return `/event/${contentId}` as Href;
  if (contentType === 'message') return '/team-chat' as Href;
  if (contentType === 'mentoring_update') return '/mentoring' as Href;
  // The id is her response: the link opens the form she was asked (RAPP-700).
  if (contentType === 'custom_form') return `/form/${contentId}` as Href;
  // The id is the report; the moderation screen lists every open one.
  if (contentType === 'forum_flag') {
    return teamScreens(access.permissions).forumModeration
      ? ('/forum-moderation' as Href)
      : access.start;
  }
  // The id is the update. Her card needs a lookup (`referralParticipantRoute`);
  // until then, or without it, the list is the closest screen.
  if (contentType === 'referral_update') return referralParticipantRoute(null, access);
  return null;
}

/** The referral update a push is about, the only identifier its payload carries. */
export function pushReferralUpdateId(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null;
  const { contentType, contentId } = data as PushDetailData;
  return contentType === 'referral_update' &&
    typeof contentId === 'string' &&
    uuidPattern.test(contentId)
    ? contentId
    : null;
}

/**
 * Where a referral update opens once the referral's woman is known: her card,
 * or the participants list while she has no account yet.
 */
export function referralParticipantRoute(
  referredProfileId: string | null,
  access: PushRouteAccess,
): Href {
  if (!teamScreens(access.permissions).participants) return access.start;
  return referredProfileId !== null && uuidPattern.test(referredProfileId)
    ? (`/participant/${referredProfileId}` as Href)
    : ('/participants' as Href);
}

export function shouldOpenPushDetail(input: {
  readonly hasSession: boolean;
  readonly needsOnboarding: boolean;
  readonly isNavigationReady: boolean;
  /** Her area and permissions are known, live or remembered. */
  readonly isAccessKnown: boolean;
}): boolean {
  return (
    input.hasSession && !input.needsOnboarding && input.isNavigationReady && input.isAccessKnown
  );
}
