import { PushPermissionRationale } from '@/components/push-permission-rationale';
import { usePushRegistration } from '@/lib/use-push-registration';
import { Stack } from 'expo-router/stack';
import { Modal, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';

// Zone boundary (RAPP-12): a crash inside the signed-in area shows the
// translated fallback here instead of unmounting the whole app.
export { ErrorFallback as ErrorBoundary } from '@/components/error-fallback';

const hiddenHeaderScreenOptions = { headerShown: false } as const;

export default function AppLayout() {
  const { needsOnboarding } = useAuth();
  // Registers this device's push token for the signed-in user (RAPP-17), and
  // surfaces the translated rationale when the OS permission is undetermined.
  const { shouldShowRationale, acceptRationale, declineRationale } = usePushRegistration();

  return (
    <>
      {/* The onboarding gate (RAPP-21), in the same Protected idiom as the
          root's session guard: an authenticated player without a completed
          profile can reach ONLY the wizard, and completing it flips the guard
          so the tabs mount with no manual navigation. `needsOnboarding` is
          deliberately false while a profile LOOKUP fails (shared/auth): a
          network flake must never route an onboarded player back into the
          wizard. */}
      <Stack screenOptions={hiddenHeaderScreenOptions}>
        <Stack.Protected guard={!needsOnboarding}>
          <Stack.Screen name="(tabs)" />
          {/* Pushed OVER the tabs, not inside them: the edit form and the
              erasure request are full-screen tasks, and the floating tab bar
              would sit on top of their primary action.

              Flat route names, NOT a `profile/` directory: the tab itself is
              already `/profile`, and a directory of the same name makes two
              routes claim one path. The push then resolves to the tab and the
              screen silently never opens. */}
          <Stack.Screen name="profile-edit" />
          <Stack.Screen name="profile-delete-data" />
          <Stack.Screen name="announcement/[id]" />
          <Stack.Screen name="event/[id]" />
          <Stack.Screen name="knowledge/index" />
          <Stack.Screen name="knowledge/[id]" />
          <Stack.Screen name="story/submit" />
        </Stack.Protected>
        <Stack.Protected guard={needsOnboarding}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
      </Stack>

      {/* Shown BEFORE the system dialog, never instead of it (SPEC UX rule).
          Dismissing counts as "not now": the OS is never asked, so iOS's single
          allotted prompt stays unspent for a later, better moment. */}
      <Modal
        visible={shouldShowRationale}
        transparent
        animationType="fade"
        onRequestClose={declineRationale}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-lg">
          <PushPermissionRationale onAccept={acceptRationale} onDecline={declineRationale} />
        </View>
      </Modal>
    </>
  );
}
