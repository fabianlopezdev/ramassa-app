/**
 * The magic-link landing route (RAPP-13).
 *
 * Supabase redirects to `ramassa://auth/callback`, and Expo Router resolves an
 * incoming deep link as a ROUTE — so without a screen at this exact path the
 * link opens the app straight onto "Unmatched Route" (found on device), even
 * though the session was being opened correctly underneath.
 *
 * The token work itself stays in `AuthDeepLinkHandler` (mounted above the
 * navigator, so it also catches the cold-start URL); this screen is the visible
 * surface: it shows "signing you in", then hands off as soon as the outcome is
 * known — into the app on success, back to login (where the error banner is
 * rendered) on a bad or expired link.
 */

import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { tokens } from '@ramassa/shared/tokens';

export default function AuthCallbackScreen() {
  const { t } = useTranslation('auth');
  const languageFontClass = useLanguageFontClass();
  const { session } = useAuth();
  const { errorCode } = useAuthFlowStatus();

  useEffect(() => {
    if (session) {
      // Signed in: hand back to the root, where the guards route by session.
      router.replace('/');
    } else if (errorCode) {
      router.replace('/login');
    }
  }, [session, errorCode]);

  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-1 items-center justify-center gap-md bg-white p-lg"
    >
      <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
      <Text className={`text-center text-md text-neutral-700 ${languageFontClass}`}>
        {t('signingIn')}
      </Text>
    </View>
  );
}
