/**
 * Participant invites on the phone (RAPP-284): the organization's invites,
 * a new one, and renewing or cancelling an open one, as the web admin's
 * Invitations screen has them, for `participants.invite` holders. The list
 * stays in memory: the `participants` root is not on the disk allow-list.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createParticipantInvite,
  fetchInvites,
  renewParticipantInvite,
  revokeParticipantInvite,
} from '@ramassa/shared/accounts';
import { useAuth } from '@ramassa/shared/auth';
import {
  buildCreateParticipantInvitePayload,
  type CreateParticipantInvite,
} from '@ramassa/shared/schemas';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

export function useParticipantInvites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['participants', user?.id ?? SIGNED_OUT, 'invites'];
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const invites = useQuery({
    queryKey,
    queryFn: () => fetchInvites(supabase),
    enabled: user !== null,
  });
  const create = useMutation({
    mutationFn: (input: CreateParticipantInvite) =>
      createParticipantInvite(supabase, buildCreateParticipantInvitePayload(input)),
    onSuccess: refresh,
  });
  const renew = useMutation({
    mutationFn: (inviteId: string) => renewParticipantInvite(supabase, inviteId),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (inviteId: string) => revokeParticipantInvite(supabase, inviteId),
    onSuccess: refresh,
  });
  return { invites, create, renew, revoke };
}
