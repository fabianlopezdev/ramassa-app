/**
 * Re-checks the session when the app comes back to the front (RAPP-234), so a
 * remote sign-out ends it on this phone too instead of leaving empty screens
 * until the token expires. At most once every 30 seconds.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';

const RECHECK_AFTER_MS = 30_000;

export function SessionFreshness() {
  const { session, refreshProfile } = useAuth();
  const lastCheck = useRef(0);
  const hasSession = session !== null;

  useEffect(() => {
    if (!hasSession) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (Date.now() - lastCheck.current < RECHECK_AFTER_MS) return;
      lastCheck.current = Date.now();
      void refreshProfile();
    });
    return () => subscription.remove();
  }, [hasSession, refreshProfile]);

  return null;
}
