/**
 * Collaborating entities on the phone (RAPP-407), for `entities.manage`
 * holders, as the entities tab of the web admin's Settings: the entities with
 * their collaborators, referrals and pending invitations; adding one,
 * switching one off or on (its collaborators lose or regain access, its
 * referral history stays); and per entity, inviting a collaborator, removing
 * or restoring a collaborator's access, and resetting their second factor.
 * Inviting and the collaborator changes ask for the step-up, as on the web.
 */
import { useStepUp } from '@/components/auth/step-up';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resetSecondFactor, useAuth } from '@ramassa/shared/auth';
import {
  createManagedEntity,
  fetchEntityCollaborators,
  fetchManagedEntities,
  inviteEntityCollaborator,
  setEntityActive,
  setEntityCollaboratorActive,
  type InviteEntityCollaboratorInput,
} from '@ramassa/shared/entity-management';
import { sendEmailOtp } from './auth';
import { supabase } from './supabase';

const entitiesRoot = (userId: string) => ['team', userId, 'entities'] as const;

export function useManagedEntities() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...entitiesRoot(user?.id ?? 'signed-out'), 'list'],
    queryFn: () => fetchManagedEntities(supabase),
    enabled: user !== null,
  });
}

export function useEntityCollaborators(entityId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...entitiesRoot(user?.id ?? 'signed-out'), 'collaborators', entityId],
    queryFn: () => fetchEntityCollaborators(supabase, entityId),
    enabled: user !== null,
  });
}

export function useEntityActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const withStepUp = useStepUp();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: entitiesRoot(user?.id ?? 'signed-out') });

  const create = useMutation({
    mutationFn: (name: string) => createManagedEntity(supabase, { name }),
    onSettled: refresh,
  });
  const setActive = useMutation({
    mutationFn: (input: { readonly entityId: string; readonly isActive: boolean }) =>
      setEntityActive(supabase, input.entityId, input.isActive),
    onSettled: refresh,
  });
  const invite = useMutation({
    mutationFn: async (input: {
      readonly entityId: string;
      readonly person: InviteEntityCollaboratorInput;
    }) => {
      const invitation = await withStepUp(() =>
        inviteEntityCollaborator(supabase, input.entityId, input.person),
      );
      const sent = await sendEmailOtp(invitation.email);
      if (!sent.ok) throw sent.error;
    },
    onSettled: refresh,
  });
  const setCollaboratorActive = useMutation({
    mutationFn: (input: { readonly profileId: string; readonly isActive: boolean }) =>
      withStepUp(() => setEntityCollaboratorActive(supabase, input.profileId, input.isActive)),
    onSettled: refresh,
  });
  const resetFactor = useMutation({
    mutationFn: (profileId: string) => withStepUp(() => resetSecondFactor(supabase, profileId)),
    onSettled: refresh,
  });
  return { create, setActive, invite, setCollaboratorActive, resetFactor };
}
