/**
 * Her notifications switch in the profile (RAPP-956), as pure decisions.
 *
 * Two things decide whether a notification reaches her phone: her own switch
 * on the server (`profiles.push_notifications_enabled`, which every send reads)
 * and the phone's permission. The screen shows them as ONE switch, because she
 * thinks of "notifications" as one thing. When the phone blocks them the switch
 * cannot fix that, so the screen says where to change it.
 */
import type { PushPermissionStatus } from './push-registration';

export interface NotificationSwitchState {
  /** The switch is on only when she wants them and the phone lets them through. */
  readonly isOn: boolean;
  /** The phone's settings block them: only the phone's settings can change that. */
  readonly isBlockedByPhone: boolean;
}

export function describeNotificationSwitch(
  accountEnabled: boolean,
  permission: PushPermissionStatus,
): NotificationSwitchState {
  return {
    isOn: accountEnabled && permission === 'granted',
    isBlockedByPhone: permission === 'denied',
  };
}

/** What turning the switch on or off does, in order. */
export type NotificationSwitchStep = 'save-on' | 'save-off' | 'ask-phone' | 'register-device';

/**
 * Off saves her choice and leaves the phone alone. On saves her choice, asks
 * the phone when it has never been asked (she asked for it here, so this is the
 * moment the explanation screen waits for), and registers this phone when the
 * phone already allows them.
 */
export function planNotificationSwitchChange(
  enabled: boolean,
  permission: PushPermissionStatus,
): readonly NotificationSwitchStep[] {
  if (!enabled) return ['save-off'];
  if (permission === 'undetermined') return ['save-on', 'ask-phone'];
  if (permission === 'granted') return ['save-on', 'register-device'];
  return ['save-on'];
}
