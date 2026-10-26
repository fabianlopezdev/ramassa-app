import type { Href } from 'expo-router';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface PushDetailData {
  readonly contentType?: unknown;
  readonly contentId?: unknown;
}

export type PushDetailQueryRoot =
  | 'player-announcements'
  | 'player-events'
  | 'messaging'
  | 'player-mentoring'
  // A form the team created asks her (RAPP-700).
  | 'player-forms';

export function pushDetailQueryRoot(contentType: unknown): PushDetailQueryRoot | null {
  if (contentType === 'announcement') return 'player-announcements';
  if (contentType === 'event') return 'player-events';
  if (contentType === 'message') return 'messaging';
  if (contentType === 'mentoring_update') return 'player-mentoring';
  if (contentType === 'custom_form') return 'player-forms';
  return null;
}

export function resolvePushDetailRoute(data: unknown): Href | null {
  if (data === null || typeof data !== 'object') return null;

  const { contentType, contentId } = data as PushDetailData;
  if (typeof contentId !== 'string' || !uuidPattern.test(contentId)) return null;
  if (contentType === 'announcement') return `/announcement/${contentId}` as Href;
  if (contentType === 'event') return `/event/${contentId}` as Href;
  if (contentType === 'message') return '/team-chat' as Href;
  if (contentType === 'mentoring_update') return '/mentoring' as Href;
  // The id is her response: the link opens the form she was asked (RAPP-700).
  if (contentType === 'custom_form') return `/form/${contentId}` as Href;
  return null;
}

export function shouldOpenPushDetail(input: {
  readonly hasSession: boolean;
  readonly needsOnboarding: boolean;
  readonly isNavigationReady: boolean;
}): boolean {
  return input.hasSession && !input.needsOnboarding && input.isNavigationReady;
}
