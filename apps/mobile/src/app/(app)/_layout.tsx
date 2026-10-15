import { AttendanceSyncWorker } from '@/components/attendance/attendance-sync-worker';
import { useAppLock } from '@/components/auth/app-lock';
import { SecondFactorScreen } from '@/components/auth/second-factor-screen';
import { useStaffLanguage } from '@/components/auth/staff-language-gate';
import { HandoverSyncWorker } from '@/components/equipment/handover-sync-worker';
import { PushPermissionRationale } from '@/components/push-permission-rationale';
import { areaHome, teamScreens } from '@/lib/account-area';
import { useAccountAccess } from '@/lib/use-account-access';
import { usePushRegistration } from '@/lib/use-push-registration';
import { Redirect, usePathname, type Href } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { ActivityIndicator, Modal, useWindowDimensions, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { tokens } from '@ramassa/shared/tokens';

// Zone boundary (RAPP-12): a crash inside the signed-in area shows the
// translated fallback here instead of unmounting the whole app.
export { ErrorFallback as ErrorBoundary } from '@/components/error-fallback';

const hiddenHeaderScreenOptions = { headerShown: false } as const;
// Her signature is a drag across the screen, which iOS would read as swipe back
// and close the handover. The screen has its own Back button (RAPP-249).
const noSwipeBackOptions = { gestureEnabled: false, fullScreenGestureEnabled: false } as const;

export default function AppLayout() {
  const { user, needsSecondFactor, permissionsAreCurrent } = useAuth();
  const userId = user?.id ?? null;
  // The area comes from the account type, never from its absence (RAPP-232):
  // an entity contact or an unknown account never lands in the player tabs.
  const { area, permissions } = useAccountAccess();
  const team = teamScreens(permissions);
  const isTeam = area === 'team';
  // Before any early return, so the authenticator screen is covered (RAPP-238).
  useStaffLanguage(isTeam || area === 'entity');

  // Registers this device's push token for the signed-in user (RAPP-17), and
  // surfaces the translated rationale when the OS permission is undetermined.
  const { shouldShowRationale, acceptRationale, declineRationale } = usePushRegistration();
  const pathname = usePathname();
  const { isCovered } = useAppLock();
  const { width } = useWindowDimensions();
  const home = areaHome(area, permissions, width);

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
        {/* The team shell (RAPP-245): tabs, large buttons or a tablet sidebar,
            holding the areas the person's permissions open. A session sheet or
            a conversation opens over it. With no area, team-home points to the
            web. */}
        <Stack.Protected
          guard={
            isTeam &&
            (team.attendance || team.participants || team.content || team.messages || team.stock)
          }
        >
          <Stack.Screen name="(team)" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.participants}>
          <Stack.Screen name="participant/[id]" />
        </Stack.Protected>
        {/* Editing a record needs the Personal level, as the database does (RAPP-281). */}
        <Stack.Protected
          guard={isTeam && team.participants && permissions.has('participants.view_personal')}
        >
          <Stack.Screen name="participant-edit/[id]" />
        </Stack.Protected>
        <Stack.Protected
          guard={isTeam && team.participants && permissions.has('participants.invite')}
        >
          <Stack.Screen name="participant-invites" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.participants && permissions.has('rgpd.erase')}>
          <Stack.Screen name="deletion-requests" />
        </Stack.Protected>
        <Stack.Protected
          guard={isTeam && team.participants && permissions.has('equipment.handover')}
        >
          <Stack.Screen name="handover/[participantId]" options={noSwipeBackOptions} />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.announcements}>
          <Stack.Screen name="content-announcement/[id]" />
          <Stack.Screen name="content-announcement-edit/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.events}>
          <Stack.Screen name="content-event/[id]" />
          <Stack.Screen name="content-event-edit/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.eventCategories}>
          <Stack.Screen name="content-event-categories" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.knowledge}>
          <Stack.Screen name="content-knowledge/[id]" />
          <Stack.Screen name="content-knowledge-edit/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.services}>
          <Stack.Screen name="content-service/[id]" />
          <Stack.Screen name="content-service-edit/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.serviceCategories}>
          <Stack.Screen name="content-service-categories" />
          <Stack.Screen name="content-service-category/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.serviceReviews}>
          <Stack.Screen name="content-service-review/[id]" />
          <Stack.Screen name="content-service-approve/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.mentoring}>
          <Stack.Screen name="team-mentoring" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.notifications}>
          <Stack.Screen name="team-notifications" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.feedback}>
          <Stack.Screen name="team-feedback" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.galleryModeration}>
          <Stack.Screen name="team-gallery" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.forumModeration}>
          <Stack.Screen name="forum-moderation" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.attendance}>
          <Stack.Screen name="attendance/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.messages}>
          <Stack.Screen name="messages/[conversationId]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.stock}>
          <Stack.Screen name="stock" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.arrivals}>
          <Stack.Screen name="arrival/new" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.counts}>
          <Stack.Screen name="count/[itemTypeId]" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.checkouts}>
          <Stack.Screen name="checkout/new" />
        </Stack.Protected>
        <Stack.Protected guard={isTeam && team.items}>
          <Stack.Screen name="items" />
          <Stack.Screen name="item-type/[id]" />
        </Stack.Protected>
        <Stack.Protected
          guard={
            isTeam &&
            !team.attendance &&
            !team.participants &&
            !team.content &&
            !team.messages &&
            !team.stock
          }
        >
          <Stack.Screen name="team-home" />
        </Stack.Protected>
        {/* A photo the desk asked for (RAPP-254); the database checks who. */}
        <Stack.Protected guard={isTeam}>
          <Stack.Screen name="photo-handoff/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={area === 'entity'}>
          <Stack.Screen name="entity-portal" />
        </Stack.Protected>
        <Stack.Protected guard={area === 'player' || area === 'team' || area === 'entity'}>
          <Stack.Screen name="app-lock" />
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
      {isTeam && permissions.has('equipment.handover') && userId !== null ? (
        <HandoverSyncWorker userId={userId} />
      ) : null}

      {/* Shown BEFORE the system dialog, never instead of it (SPEC UX rule).
          Dismissing counts as "not now": the OS is never asked, so iOS's single
          allotted prompt stays unspent for a later, better moment. */}
      <Modal
        visible={shouldShowRationale && !isCovered}
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
