/**
 * Signing out with signed authorizations still waiting on this tablet
 * (RAPP-305). They are not lost: they stay encrypted on the tablet under the
 * coach's account and go out the next time she signs in here. A remote sign-out
 * keeps them the same way. The coach is told before she signs out, so she can
 * first wait for a connection.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { logout } from './auth';
import { pendingSigningCountNow } from './tablet-signing';

/** Signs out at once, or asks first when signings still wait on this tablet. */
export function useGuardedLogout(): () => void {
  const { t } = useTranslation('participants');
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useCallback(() => {
    const pending = pendingSigningCountNow(userId);
    if (pending === 0) {
      void logout();
      return;
    }
    const title = t('signing.signOutTitle', { count: pending });
    const body = t('signing.signOutBody');
    // The web build has no native alert, so it asks through the browser.
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${body}`)) void logout();
      return;
    }
    Alert.alert(title, body, [
      { text: t('signing.signOutStay'), style: 'cancel' },
      { text: t('signing.signOutAnyway'), style: 'destructive', onPress: () => void logout() },
    ]);
  }, [t, userId]);
}
