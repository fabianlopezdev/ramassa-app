import { ensureAndroidChannel, getEasProjectId } from '@/lib/push-notifications';
import { SchedulableTriggerInputTypes, scheduleNotificationAsync } from 'expo-notifications';
import { useState } from 'react';
import { DevButton, DevButtonRow, DevNote, DevRow, DevSection } from './dev-ui';

/**
 * Local push test (SPEC "Push notification test").
 *
 * Fires a notification through the OS without a server, an Expo push token, or
 * a `push_tokens` row, so it works on a simulator where real push usually will
 * not. It also forces the Android channel to exist first, which is the actual
 * bug this catches: without the `default` channel Android delivers silently at
 * minimum importance, and Android is the primary platform here.
 *
 * It does NOT prove the send pipeline (RAPP-36) or the token round trip
 * (RAPP-82); it proves the device will render what this app asks it to.
 */
export function DevPushSection() {
  const [status, setStatus] = useState('');

  async function fireLocalNotification() {
    await ensureAndroidChannel();
    await scheduleNotificationAsync({
      content: { title: 'Ramassà dev', body: 'Local notification from the dev menu (RAPP-19)' },
      trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10 },
    });
    setStatus('Scheduled in 10 seconds. Background the app to verify the system banner.');
  }

  return (
    <DevSection title="Push">
      <DevRow label="EAS project id" value={getEasProjectId() ?? 'missing'} />
      <DevNote>Local only: no token, no server, no push_tokens row.</DevNote>
      <DevButtonRow>
        <DevButton
          label="Fire a local notification"
          testID="dev-fire-local-notification"
          onPress={() => void fireLocalNotification()}
        />
      </DevButtonRow>
      {status === '' ? null : <DevNote>{status}</DevNote>}
    </DevSection>
  );
}
