/**
 * The team's accounts on the phone (RAPP-404), for `team.manage` holders, as
 * the web admin's Team tab: who is on the team with their access summary, and
 * inviting, removing, resetting a second factor and signing someone out
 * everywhere. Every change but the sign-out asks for the step-up first, as on
 * the web; the database checks `team.manage`, keeps one team manager, and
 * audits each change. An invitation gets its sign-in code by email. A
 * person's switches and the presets are changed here too (RAPP-405); a change
 * to one's own access reads the permissions again at once.
 */
import { useStepUp } from '@/components/auth/step-up';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resetSecondFactor, signOutEverywhere, useAuth } from '@ramassa/shared/auth';
import {
  fetchStaffMembers,
  inviteStaffMember,
  removeStaffMember,
} from '@ramassa/shared/organization-settings';
import {
  applyPermissionPreset,
  deletePermissionPreset,
  fetchTeamAccess,
  restorePermissionPresetDefault,
  savePermissionPreset,
  setTeamMemberPermissions,
  type PermissionCode,
  type PermissionPreset,
} from '@ramassa/shared/permissions';
import { logout, sendEmailOtp } from './auth';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

const teamRoot = (userId: string) => ['team', userId, 'staff'] as const;

export function useTeamStaff() {
  const { user } = useAuth();
  const root = teamRoot(user?.id ?? SIGNED_OUT);
  const members = useQuery({
    queryKey: [...root, 'members'],
    queryFn: () => fetchStaffMembers(supabase),
    enabled: user !== null,
  });
  const access = useQuery({
    queryKey: [...root, 'access'],
    queryFn: () => fetchTeamAccess(supabase),
    enabled: user !== null,
  });
  return { members, access };
}

export function useStaffActions() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const withStepUp = useStepUp();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: teamRoot(user?.id ?? SIGNED_OUT) });

  const invite = useMutation({
    mutationFn: async (input: {
      readonly firstName: string;
      readonly lastName: string;
      readonly email: string;
      readonly preset: PermissionPreset | undefined;
    }) => {
      const { preset, ...person } = input;
      // The account type follows the preset, as on the web admin: Admin makes
      // an admin account, anything else a staff account on the Staff preset.
      const role = preset?.builtinKey === 'admin' ? 'admin' : 'staff';
      const invitation = await withStepUp(() => inviteStaffMember(supabase, { ...person, role }));
      if (preset !== undefined && preset.builtinKey !== role) {
        await withStepUp(() => applyPermissionPreset(supabase, preset.id, [invitation.profileId]));
      }
      const sent = await sendEmailOtp(invitation.email);
      if (!sent.ok) throw sent.error;
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (profileId: string) => withStepUp(() => removeStaffMember(supabase, profileId)),
    onSettled: refresh,
  });
  const resetFactor = useMutation({
    mutationFn: (profileId: string) => withStepUp(() => resetSecondFactor(supabase, profileId)),
    onSettled: refresh,
  });
  const signOutAll = useMutation({
    mutationFn: async (profileId: string) => {
      await signOutEverywhere(supabase, profileId);
      // Signing herself out everywhere ends this phone's session too.
      if (profileId === user?.id) await logout();
    },
    onSettled: refresh,
  });
  const refreshIfMine = async (profileIds: readonly string[]) => {
    if (user !== null && profileIds.includes(user.id)) await refreshProfile();
  };
  const saveAccess = useMutation({
    mutationFn: async (input: {
      readonly profileId: string;
      readonly permissions: ReadonlySet<PermissionCode>;
      readonly presetId: string | null;
    }) => {
      await withStepUp(() => setTeamMemberPermissions(supabase, input));
      await refreshIfMine([input.profileId]);
    },
    onSettled: refresh,
  });
  const savePreset = useMutation({
    mutationFn: (input: {
      readonly presetId: string | null;
      readonly name: string | null;
      readonly permissions: ReadonlySet<PermissionCode>;
    }) => withStepUp(() => savePermissionPreset(supabase, input)),
    onSettled: refresh,
  });
  const applyPreset = useMutation({
    mutationFn: async (input: {
      readonly presetId: string;
      readonly profileIds: readonly string[];
    }) => {
      await withStepUp(() => applyPermissionPreset(supabase, input.presetId, input.profileIds));
      await refreshIfMine(input.profileIds);
    },
    onSettled: refresh,
  });
  const deletePreset = useMutation({
    mutationFn: (presetId: string) => withStepUp(() => deletePermissionPreset(supabase, presetId)),
    onSettled: refresh,
  });
  const restorePreset = useMutation({
    mutationFn: (presetId: string) =>
      withStepUp(() => restorePermissionPresetDefault(supabase, presetId)),
    onSettled: refresh,
  });
  return {
    invite,
    remove,
    resetFactor,
    signOutAll,
    saveAccess,
    savePreset,
    applyPreset,
    deletePreset,
    restorePreset,
  };
}
