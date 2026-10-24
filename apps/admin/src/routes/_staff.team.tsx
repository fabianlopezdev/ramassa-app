/**
 * Organització › Equip (RAPP-231): the people on the team, what each may do,
 * and the presets. A Settings tab until the menu grouped by audience
 * (RAPP-654); `/settings?tab=staff` still forwards here.
 *
 * team.manage opens it; the database checks every change again, and risky
 * changes ask for a fresh authenticator code first (RAPP-235). `ssr: false`
 * for the reason every staff screen gives (the session lives in localStorage,
 * ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { useStepUp } from '@/components/auth/step-up';
import { Page } from '@/components/layout/page';
import { TeamAccessPanel } from '@/components/team/team-access-panel';
import { sendEmailOtp } from '@/lib/auth';
import { TEAM_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { resetSecondFactor, signOutEverywhere, useAuth } from '@ramassa/shared/auth';
import {
  fetchStaffMembers,
  inviteStaffMember,
  removeStaffMember,
  setTeamMemberTestAccount,
} from '@ramassa/shared/organization-settings';
import {
  applyPermissionPreset,
  deletePermissionPreset,
  fetchTeamAccess,
  restorePermissionPresetDefault,
  savePermissionPreset,
  setTeamMemberPermissions,
} from '@ramassa/shared/permissions';

export const Route = createFileRoute('/_staff/team')({
  ssr: false,
  loader: async () => {
    const [staffMembers, teamAccess] = await Promise.all([
      fetchStaffMembers(supabase),
      fetchTeamAccess(supabase),
    ]);
    return { staffMembers, teamAccess };
  },
  component: TeamPage,
});

function TeamPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={TEAM_PERMISSIONS}>
      <TeamScreen />
    </RequireAuth>
  );
}

function TeamScreen() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const { permissions, user, refreshProfile } = useAuth();
  const withStepUp = useStepUp();

  async function refresh() {
    await router.invalidate({ sync: true });
  }

  // A change to the reader's own toggles updates her menus at once.
  async function refreshIfMine(profileIds: readonly string[]) {
    if (user !== null && profileIds.includes(user.id)) await refreshProfile();
    await refresh();
  }

  return (
    <Page>
      <TeamAccessPanel
        members={data.staffMembers}
        access={data.teamAccess.members}
        presets={data.teamAccess.presets}
        myPermissions={permissions}
        onInvite={async ({ presetId, ...person }) => {
          const preset = data.teamAccess.presets.find((candidate) => candidate.id === presetId);
          // The account type follows the preset: Admin makes an admin account,
          // anything else a staff account, which starts on the Staff preset.
          const role = preset?.builtinKey === 'admin' ? 'admin' : 'staff';
          const invitation = await withStepUp(() =>
            inviteStaffMember(supabase, { ...person, role }),
          );
          if (preset !== undefined && preset.builtinKey !== role) {
            await withStepUp(() =>
              applyPermissionPreset(supabase, preset.id, [invitation.profileId]),
            );
          }
          const result = await sendEmailOtp(invitation.email);
          if (!result.ok) throw result.error;
          await refresh();
        }}
        onSaveMemberAccess={async (input) => {
          await withStepUp(() => setTeamMemberPermissions(supabase, input));
          await refreshIfMine([input.profileId]);
        }}
        onSavePreset={async (input) => {
          const presetId = await withStepUp(() => savePermissionPreset(supabase, input));
          await refresh();
          return presetId;
        }}
        onApplyPreset={async (presetId, profileIds) => {
          await withStepUp(() => applyPermissionPreset(supabase, presetId, profileIds));
          await refreshIfMine(profileIds);
        }}
        onDeletePreset={async (presetId) => {
          await withStepUp(() => deletePermissionPreset(supabase, presetId));
          await refresh();
        }}
        onRestorePreset={async (presetId) => {
          await withStepUp(() => restorePermissionPresetDefault(supabase, presetId));
          await refresh();
        }}
        onRemove={async (profileId) => {
          await withStepUp(() => removeStaffMember(supabase, profileId));
          await refresh();
        }}
        currentUserId={user?.id ?? null}
        onResetSecondFactor={async (profileId) => {
          await withStepUp(() => resetSecondFactor(supabase, profileId));
          await refresh();
        }}
        onSetTestAccount={async (profileId, isTestAccount) => {
          await setTeamMemberTestAccount(supabase, profileId, isTestAccount);
          await refresh();
        }}
        onSignOutEverywhere={async (profileId) => {
          await signOutEverywhere(supabase, profileId);
          // Signing herself out ends this tab as well.
          await refreshIfMine([profileId]);
        }}
      />
    </Page>
  );
}
