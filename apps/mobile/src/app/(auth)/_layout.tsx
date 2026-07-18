import { Stack } from 'expo-router/stack';

// Zone boundary (RAPP-12): auth-flow crashes stay inside the auth zone.
export { ErrorFallback as ErrorBoundary } from '@/components/error-fallback';

export default function AuthLayout() {
  // The login screen renders its own heading, so no navigation header here.
  return <Stack screenOptions={{ headerShown: false }} />;
}
