/**
 * Her notifications switch in the profile (RAPP-956), wired to the phone and
 * the server. The decisions live in `push-settings`; this hook only runs them.
 *
 * The phone's permission is read again each time the app comes back to the
 * front, because the way to undo a "no" given to the phone is the phone's own
 * settings, and she comes back from there expecting the screen to know.
 *
 * The switch moves at once and goes back if the server says no: on patchy data
 * a switch that waits for the answer reads as broken.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { addForegroundListener } from './app-foreground';
import { logger } from './observability';
import { usePreviewModeActive } from './preview-mode';
import {
  fetchOwnPushNotifications,
  getPushPermissionStatus,
  registerPushToken,
  requestPushPermission,
  saveOwnPushNotifications,
} from './push-notifications';
import type { PushPermissionStatus } from './push-registration';
import { describeNotificationSwitch, planNotificationSwitchChange } from './push-settings';
import { previewMode } from './supabase';

const SIGNED_OUT = 'signed-out';

export const ownPushNotificationsQueryKey = (userId: string | null) =>
  ['own-push-notifications', userId ?? SIGNED_OUT] as const;

export interface PushSettings {
  /** False until both her switch and the phone's permission are known. */
  readonly isReady: boolean;
  readonly isOn: boolean;
  readonly isBlockedByPhone: boolean;
  /** The player preview changes nothing (RAPP-371), and a change is on its way. */
  readonly isLocked: boolean;
  /** Her switch could not be read, or her change could not be saved. */
  readonly failure: 'load' | 'save' | null;
  readonly setEnabled: (enabled: boolean) => void;
}

export function usePushSettings(): PushSettings {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isPreview = usePreviewModeActive(previewMode);
  const queryClient = useQueryClient();
  const queryKey = ownPushNotificationsQueryKey(userId);
  const [permission, setPermission] = useState<PushPermissionStatus | null>(null);

  const readPermission = useCallback(() => {
    // The web has no notifications of its own; the row is not shown there.
    if (Platform.OS === 'web') {
      setPermission('denied');
      return;
    }
    void getPushPermissionStatus().then(setPermission, (error: unknown) => {
      logger.info('push permission read failed', { error });
      setPermission('undetermined');
    });
  }, []);

  useEffect(() => {
    readPermission();
    const subscription = addForegroundListener(readPermission);
    return () => subscription.remove();
  }, [readPermission]);

  const account = useQuery({
    queryKey,
    queryFn: () => fetchOwnPushNotifications(userId ?? ''),
    enabled: userId !== null,
    staleTime: 0,
  });

  const change = useMutation<void, Error, boolean, { previous: boolean | undefined }>({
    mutationFn: async (enabled) => {
      const steps = planNotificationSwitchChange(enabled, permission ?? 'undetermined');
      for (const step of steps) {
        if (step === 'save-on' || step === 'save-off') {
          await saveOwnPushNotifications(step === 'save-on');
        } else if (step === 'ask-phone') {
          // She turned them on here, which is the yes the explanation asks for.
          const phone = await requestPushPermission();
          setPermission(phone);
          if (phone === 'granted' && userId !== null) await registerPushToken(userId);
        } else if (userId !== null) {
          await registerPushToken(userId);
        }
      }
    },
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<boolean>(queryKey);
      queryClient.setQueryData(queryKey, enabled);
      return { previous };
    },
    onError: (error, _enabled, context) => {
      logger.error('push.settings.save.failed', { error });
      if (context !== undefined) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const { mutate } = change;
  const setEnabled = useCallback((enabled: boolean) => mutate(enabled), [mutate]);
  const state = describeNotificationSwitch(account.data === true, permission ?? 'undetermined');

  return {
    isReady: permission !== null && account.data !== undefined,
    isOn: state.isOn,
    isBlockedByPhone: state.isBlockedByPhone,
    isLocked: isPreview || change.isPending,
    failure: account.isError ? 'load' : change.isError ? 'save' : null,
    setEnabled,
  };
}
