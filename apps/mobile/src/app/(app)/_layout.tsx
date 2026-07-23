import { PushPermissionRationale } from '@/components/push-permission-rationale';
import { usePushRegistration } from '@/lib/use-push-registration';
import { Stack } from 'expo-router/stack';
import { Modal, View } from 'react-native';

// Zone boundary (RAPP-12): a crash inside the signed-in area shows the
// translated fallback here instead of unmounting the whole app.
export { ErrorFallback as ErrorBoundary } from '@/components/error-fallback';

export default function AppLayout() {
  // Registers this device's push token for the signed-in user (RAPP-17), and
  // surfaces the translated rationale when the OS permission is undetermined.
  const { shouldShowRationale, acceptRationale, declineRationale } = usePushRegistration();

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
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
