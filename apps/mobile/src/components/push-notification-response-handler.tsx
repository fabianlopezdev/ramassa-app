import { areaHome } from '@/lib/account-area';
import {
  pushDetailQueryRoot,
  pushReferralUpdateId,
  referralParticipantRoute,
  resolvePushDetailRoute,
  shouldOpenPushDetail,
  type PushRouteAccess,
} from '@/lib/push-deep-link';
import { fetchReferralUpdateSubject } from '@/lib/push-referral-subject';
import { resolvePushPlatform } from '@/lib/push-registration';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { useAccountAccess } from '@/lib/use-account-access';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';

interface PendingPushDetail {
  readonly responseId: string;
  readonly data: unknown;
}

const KNOWN_AREAS = new Set(['player', 'team', 'entity']);

/**
 * The precise target of a referral update: her card, read through the update
 * (the payload names only the update). Any failure keeps the closest screen.
 */
async function referralTarget(
  data: unknown,
  access: PushRouteAccess,
  closest: Href,
): Promise<Href> {
  const updateId = pushReferralUpdateId(data);
  if (updateId === null || closest !== '/participants') return closest;
  try {
    return referralParticipantRoute(await fetchReferralUpdateSubject(supabase, updateId), access);
  } catch {
    return closest;
  }
}

export function PushNotificationResponseHandler() {
  const { session, needsOnboarding } = useAuth();
  const { area, permissions } = useAccountAccess();
  const { width } = useWindowDimensions();
  const hasSession = session !== null;
  const navigationState = useRootNavigationState();
  const [pending, setPending] = useState<PendingPushDetail | null>(null);
  const handledResponseIds = useRef(new Set<string>());
  const access = useMemo<PushRouteAccess>(
    () => ({ permissions, start: (areaHome(area, permissions, width) ?? '/') as Href }),
    [area, permissions, width],
  );

  const receiveResponse = useCallback((response: Notifications.NotificationResponse) => {
    const responseId = response.notification.request.identifier;
    if (handledResponseIds.current.has(responseId)) return;

    const data: unknown = response.notification.request.content.data;
    const contentType =
      data === null || typeof data !== 'object'
        ? undefined
        : (data as { readonly contentType?: unknown }).contentType;
    if (pushDetailQueryRoot(contentType) === null) return;
    setPending({ responseId, data });
  }, []);

  useEffect(() => {
    // expo-notifications exposes these methods to the web bundle, but throws
    // when they are invoked. Web push is not supported yet, so keep the handler
    // inert there just like token registration.
    if (resolvePushPlatform(Platform.OS) === null) return;

    let active = true;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active && response !== null) receiveResponse(response);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(receiveResponse);
    return () => {
      active = false;
      subscription.remove();
    };
  }, [receiveResponse]);

  useEffect(() => {
    if (pending === null) return;
    if (
      !shouldOpenPushDetail({
        hasSession,
        needsOnboarding,
        isNavigationReady: navigationState?.key !== undefined,
        isAccessKnown: KNOWN_AREAS.has(area),
      })
    ) {
      return;
    }

    handledResponseIds.current.add(pending.responseId);
    setPending(null);
    void Notifications.clearLastNotificationResponseAsync();
    const route = resolvePushDetailRoute(pending.data, access);
    const queryRoot = pushDetailQueryRoot(
      (pending.data as { readonly contentType?: unknown }).contentType,
    );
    if (route === null || queryRoot === null) return;
    // A root is the first segment of a player key and a later one of a team
    // key (`['team', userId, 'forum-moderation', ...]`).
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey.includes(queryRoot),
      refetchType: 'all',
    });
    void referralTarget(pending.data, access, route).then((target) => router.push(target));
  }, [access, area, hasSession, navigationState?.key, needsOnboarding, pending]);

  return null;
}
