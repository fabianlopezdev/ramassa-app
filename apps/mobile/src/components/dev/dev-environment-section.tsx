import { summarizeDevEnvironment } from '@/lib/dev/dev-environment';
import { getOrCreateDeviceId } from '@/lib/device-id';
import { resolvePushRegistrationDecision } from '@/lib/push-notifications';
import { preferencesStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import { isDevice, modelName, osName, osVersion } from 'expo-device';
import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { useLanguage } from '@ramassa/shared/i18n';
import { DevButton, DevButtonRow, DevNote, DevRow, DevSection } from './dev-ui';

/**
 * What build am I running, against what, as whom (RAPP-19 scope item 3).
 *
 * The push line is the one worth explaining: `resolvePushRegistrationDecision`
 * returns a typed skip reason, and "why did no token get written" is otherwise
 * a ten-minute hunt through three modules. Formatting and redaction live in the
 * pure `dev-environment` module; this component only collects live values.
 */
export function DevEnvironmentSection() {
  const { user, role, session } = useAuth();
  const { language, direction } = useLanguage();
  const [pushRegistration, setPushRegistration] = useState('resolving...');
  const [refreshStatus, setRefreshStatus] = useState('');

  useEffect(() => {
    let isSubscribed = true;
    void resolvePushRegistrationDecision(Boolean(session)).then((decision) => {
      if (isSubscribed) {
        setPushRegistration(decision.kind === 'skip' ? `skip: ${decision.reason}` : decision.kind);
      }
    });
    return () => {
      isSubscribed = false;
    };
  }, [session]);

  const rows = summarizeDevEnvironment({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'missing',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    commitSha: process.env.EXPO_PUBLIC_COMMIT_SHA,
    appVersion: Constants.expoConfig?.version ?? null,
    // Unset in app.json today (EAS will own it from RAPP-68), so this reads
    // "unknown" rather than pretending a build number exists.
    nativeBuildVersion:
      Constants.expoConfig?.ios?.buildNumber ??
      (Constants.expoConfig?.android?.versionCode === undefined
        ? null
        : String(Constants.expoConfig.android.versionCode)),
    expoSdkVersion: Constants.expoConfig?.sdkVersion ?? null,
    deviceModelName: modelName,
    osName,
    osVersion,
    isPhysicalDevice: isDevice,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    role,
    sessionExpiresAt: session?.expires_at ?? null,
    deviceId: getOrCreateDeviceId(preferencesStorage),
    pushRegistration,
  });

  // Direction belongs HERE, in the first section, not only in the language
  // section several screens down. It is the state that confuses everyone (React
  // Native applies a direction flip on the next start only, so the app can be
  // Arabic while still laying out left to right), and burying the readout meant
  // it could only be seen by someone who already knew to scroll for it. It also
  // makes the state assertable the moment the menu opens: reaching a control
  // deep in a long ScrollView is genuinely unreliable, because the view
  // hierarchy reports off-screen rows as present and every search then believes
  // it has already arrived (RAPP-20).
  const nativeDirection = I18nManager.isRTL ? 'rtl' : 'ltr';
  const directionValue =
    nativeDirection === direction
      ? `${direction} (native matches)`
      : `${direction} (native ${nativeDirection}, stale until restart)`;

  async function refreshSession() {
    const { error } = await supabase.auth.refreshSession();
    setRefreshStatus(
      error === null ? 'Session refreshed and persisted.' : 'Session refresh failed.',
    );
  }

  return (
    <DevSection title="Environment">
      {rows.map((row) => (
        <DevRow key={row.label} label={row.label} value={row.value} />
      ))}
      <DevRow label="Language" value={language} />
      <DevRow label="Layout direction" value={directionValue} />
      <DevButtonRow>
        <DevButton label="Refresh session" onPress={() => void refreshSession()} />
      </DevButtonRow>
      {refreshStatus === '' ? null : <DevNote>{refreshStatus}</DevNote>}
    </DevSection>
  );
}
