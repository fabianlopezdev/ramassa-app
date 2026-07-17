import { Stack } from 'expo-router/stack';

// Zone boundary (RAPP-12): a crash inside the signed-in area shows the
// translated fallback here instead of unmounting the whole app.
export { ErrorFallback as ErrorBoundary } from '@/components/error-fallback';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
