import { AttendanceSyncWorker } from '@/components/attendance/attendance-sync-worker';
import { SecondFactorScreen } from '@/components/auth/second-factor-screen';
import { PushPermissionRationale } from '@/components/push-permission-rationale';
import { areaHome, teamScreens } from '@/lib/account-area';
import { useAccountAccess } from '@/lib/use-account-access';
import { usePushRegistration } from '@/lib/use-push-registration';
import { Redirect, usePathname, type Href } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { ActivityIndicator, Modal, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { tokens } from '@ramassa/shared/tokens';

// Zone boundary (RAPP-12): a crash inside the signed-in area shows the
// translated fallback here instead of unmounting the whole app.
export { ErrorFallback as ErrorBoundary } from '@/components/error-fallback';

const hiddenHeaderScreenOptions = { headerShown: false } as const;

export default function AppLayout() {
  const { user, needsSecondFactor, permissionsAreCurrent } = useAuth();
  const userId = user?.id ?? null;
  // The area comes from the account type, never from its absence (RAPP-232):
  // an entity contact or an unknown account never lands in the player tabs.
  const { area, permissions } = useAccountAccess();
  const team = teamScreens(permissions);
  const isTeam = area === 'team';

  // Registers this device's push token for the signed-in user (RAPP-17), and
  // surfaces the translated rationale when the OS permission is undetermined.
  const { shouldShowRationale, acceptRationale, declineRationale } = usePushRegistration();
  const pathname = usePathname();
  const home = areaHome(area, permissions);

  // Just after signing in, the account type is not known yet. The screens wait
  // for it, so the stack mounts once with the right area and opens its first
  // screen, instead of passing through a wrong one (RAPP-232).
  if (area === 'resolving' || (isTeam && !needsSecondFactor && !permissionsAreCurrent)) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50" testID="account-resolving">
        <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
      </View>
    );
  }
  // A team member verifies her authenticator before any team screen (RAPP-233):
  // until then the database lets her session reach nothing.
  if (isTeam && needsSecondFactor) {
    return <SecondFactorScreen />;
  }
  if (home !== null && pathname === '/') {
    return <Redirect href={home as Href} />;
  }

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
        <Stack.Protected guard={area === 'player'}>
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
          <Stack.Screen name="service/[id]" />
          <Stack.Screen name="story/submit" />
          <Stack.Screen name="forum/create" />
          <Stack.Screen name="forum/[id]" />
          <Stack.Screen name="gallery/index" />
          <Stack.Screen name="gallery/upload" />
          <Stack.Screen name="gallery/[id]" />
          <Stack.Screen name="team-chat" />
          <Stack.Screen name="mentoring/index" />
          <Stack.Screen name="feedback/index" />
          <Stack.Screen name="survey/[id]" />
        </Stack.Protected>
        {/* Team screens open by permission; the first one available is where a
            team member lands. With none of them, team-home points to the web. */}
        <Stack.Protected guard={isTeam && team.attendance}>
          <Stack.Screen name="attendance/index" />
          <Stack.Screen name="attendance/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.messages}>
          <Stack.Screen name="messages/index" />
          <Stack.Screen name="messages/[conversationId]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && !team.attendance && !team.messages}>
          <Stack.Screen name="team-home" />
        </Stack.Protected>
        <Stack.Protected guard={area === 'entity'}>
          <Stack.Screen name="entity-portal" />
        </Stack.Protected>
        <Stack.Protected guard={area === 'unresolved'}>
          <Stack.Screen name="account-unresolved" />
        </Stack.Protected>
        <Stack.Protected guard={area === 'onboarding'}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
      </Stack>
      {isTeam && permissions.has('attendance.mark') && userId !== null ? (
        <AttendanceSyncWorker userId={userId} />
      ) : null}

      {/* Shown BEFORE the system dialog, never instead of it (SPEC UX rule).
          Dismissing counts as "not now": the OS is never asked, so iOS's single
          allotted prompt stays unspent for a later, better moment. */}
      <Modal
        visible={shouldShowRationale}
        transparent
        animationType="fade"
        onRequestClose={declineRationale}
      >
        <View
          accessibilityViewIsModal
          className="flex-1 items-center justify-center bg-black/50 px-lg"
        >
          <PushPermissionRationale onAccept={acceptRationale} onDecline={declineRationale} />
        </View>
      </Modal>
    </>
  );
}
