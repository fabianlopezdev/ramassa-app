/**
 * Turns an incoming magic-link deep link into a session (RAPP-13). It watches
 * the URL that opened (or foregrounded) the app; when that URL is our auth
 * callback, it validates the origin and opens the session. On success
 * supabase-js fires `onAuthStateChange`, the AuthProvider updates, and the
 * root navigator redirects into the app. On failure (an expired or untrusted
 * link) the mapped `AUTH-*` code is pushed to the auth-flow status so the login
 * screen shows it. Renders nothing.
 */

import { completeMagicLink, isAuthCallbackUrl } from '@/lib/auth';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';

export function AuthDeepLinkHandler() {
  const url = Linking.useURL();
  const { setErrorCode } = useAuthFlowStatus();

  useEffect(() => {
    if (!url || !isAuthCallbackUrl(url)) {
      return;
    }
    setErrorCode(null);
    void completeMagicLink(url).then((result) => {
      if (!result.ok) {
        setErrorCode(result.error.code);
      }
    });
  }, [url, setErrorCode]);

  return null;
}
