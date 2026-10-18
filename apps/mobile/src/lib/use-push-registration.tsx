import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import { takePreviewHandover } from './preview-handover';
import { usePreviewModeActive } from './preview-mode';
import {
  registerPushToken,
  requestPushPermission,
  resolvePushRegistrationDecision,
} from './push-notifications';
import { declinePushRationale, hasDeclinedPushRationale } from './push-rationale-memory';
import { previewMode } from './supabase';

/**
 * Drives push-token registration for the signed-in user (RAPP-17).
 *
 * Runs on every app start so a rotated token is refreshed (the write itself is
 * skipped when nothing changed). When the OS permission is still undetermined it
 * does NOT prompt: it flips `shouldShowRationale`, and the UI shows the
 * translated explanation first (SPEC UX hard constraint). Only an explicit accept
 * reaches the real system dialog.
 *
 * Every other outcome is a quiet no-op. Push is optional and the app must be
 * fully usable without it, so a denial, a simulator, or the missing EAS
 * projectId simply means no token.
 */
export function usePushRegistration(): {
  shouldShowRationale: boolean;
  acceptRationale: () => void;
  declineRationale: () => void;
} {
  const { session, user } = useAuth();
  const [shouldShowRationale, setShouldShowRationale] = useState(false);
  const userId = user?.id ?? null;
  // Signing in or out re-runs the check; a refreshed session object does not.
  const isSignedIn = Boolean(session);
  // The player preview has no device of its own and changes nothing (RAPP-371).
  const isPreview = usePreviewModeActive(previewMode);

  useEffect(() => {
    if (isPreview) return undefined;
    let cancelled = false;

    void (async () => {
      const decision = await resolvePushRegistrationDecision(isSignedIn);
      if (cancelled) return;

      if (decision.kind === 'request-permission') {
        // Back from the player preview, she has already been asked this time.
        // She said "not now" earlier in this run (RAPP-530).
        if (hasDeclinedPushRationale(userId)) return;
        if (!takePreviewHandover('push-rationale')) setShouldShowRationale(true);
        return;
      }
      if (decision.kind === 'register' && userId) {
        await registerPushToken(userId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPreview, isSignedIn, userId]);

  const acceptRationale = useCallback(() => {
    setShouldShowRationale(false);
    void (async () => {
      // Only now does the real OS dialog appear.
      const status = await requestPushPermission();
      if (status === 'granted' && userId) {
        await registerPushToken(userId);
      }
    })();
  }, [userId]);

  const declineRationale = useCallback(() => {
    // No token, no error, no nagging: the OS is never asked, so the one system
    // prompt iOS allows stays unspent for a later, better moment.
    setShouldShowRationale(false);
    declinePushRationale(userId);
  }, [userId]);

  return { shouldShowRationale, acceptRationale, declineRationale };
}
