/**
 * The team's accounts on the phone (RAPP-404), for `team.manage` holders, as
 * the web admin's Team tab: who is on the team with their access summary, and
 * inviting, removing, resetting a second factor and signing someone out
 * everywhere. Every change but the sign-out asks for the step-up first, as on
 * the web; the database checks `team.manage`, keeps one team manager, and
 * audits each change. An invitation gets its sign-in code by email.
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
  fetchTeamAccess,
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
  const { user } = useAuth();
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
  return { invite, remove, resetFactor, signOutAll };
}
