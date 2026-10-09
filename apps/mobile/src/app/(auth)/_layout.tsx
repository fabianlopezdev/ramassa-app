import { consumeLanguageConfirmation } from '@/lib/language-confirmation';
import { preferencesStorage } from '@/lib/storage';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';

// Zone boundary (RAPP-12): auth-flow crashes stay inside the auth zone.
export { ErrorFallback as ErrorBoundary } from '@/components/error-fallback';

export const unstable_settings = { anchor: 'index' };

const authScreenOptions = ({ route }: { readonly route: { readonly name: string } }) => ({
  headerShown: false,
  scrollEdgeEffects: route.name === 'index' ? ({ top: 'hidden' } as const) : undefined,
});

export default function AuthLayout() {
  const router = useRouter();
  useEffect(() => {
    if (consumeLanguageConfirmation(preferencesStorage)) router.push('/email-login');
  }, [router]);
  return <Stack screenOptions={authScreenOptions} />;
}
