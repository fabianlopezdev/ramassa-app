import {
  pushDetailQueryRoot,
  resolvePushDetailRoute,
  shouldOpenPushDetail,
  type PushDetailQueryRoot,
} from '@/lib/push-deep-link';
import { queryClient } from '@/lib/query-client';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@ramassa/shared/auth';

interface PendingPushDetail {
  readonly responseId: string;
  readonly route: NonNullable<ReturnType<typeof resolvePushDetailRoute>>;
  readonly queryRoot: PushDetailQueryRoot;
}

export function PushNotificationResponseHandler() {
  const { session, needsOnboarding } = useAuth();
  const hasSession = session !== null;
  const navigationState = useRootNavigationState();
  const [pending, setPending] = useState<PendingPushDetail | null>(null);
  const handledResponseIds = useRef(new Set<string>());

  const receiveResponse = useCallback((response: Notifications.NotificationResponse) => {
    const responseId = response.notification.request.identifier;
    if (handledResponseIds.current.has(responseId)) return;

    const data = response.notification.request.content.data;
    const route = resolvePushDetailRoute(data);
    const queryRoot =
      data === null || typeof data !== 'object'
        ? null
        : pushDetailQueryRoot((data as { readonly contentType?: unknown }).contentType);
    if (route === null || queryRoot === null) return;
    setPending({ responseId, route, queryRoot });
  }, []);

  useEffect(() => {
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
      })
    ) {
      return;
    }

    handledResponseIds.current.add(pending.responseId);
    void queryClient.invalidateQueries({ queryKey: [pending.queryRoot], refetchType: 'all' });
    router.push(pending.route);
    setPending(null);
    void Notifications.clearLastNotificationResponseAsync();
  }, [hasSession, navigationState?.key, needsOnboarding, pending]);

  return null;
}
