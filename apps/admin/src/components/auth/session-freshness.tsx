/**
 * Re-checks the session when the tab comes back into view (RAPP-234), so a
 * remote sign-out ends this tab too instead of leaving empty screens until the
 * token expires. At most once every 30 seconds.
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '@ramassa/shared/auth';

const RECHECK_AFTER_MS = 30_000;

export function SessionFreshness() {
  const { session, refreshProfile } = useAuth();
  const lastCheck = useRef(0);
  const hasSession = session !== null;

  useEffect(() => {
    if (!hasSession) return;
    function recheck() {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheck.current < RECHECK_AFTER_MS) return;
      lastCheck.current = Date.now();
      void refreshProfile();
    }
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [hasSession, refreshProfile]);

  return null;
}
