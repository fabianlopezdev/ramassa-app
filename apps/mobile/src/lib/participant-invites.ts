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
import type { QuestionStates } from '@ramassa/shared/intake';
import { fetchIntakeCatalog } from '@ramassa/shared/intake-builder';
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
  // With the questions staff confirmed she is asked (RAPP-618), saved in the
  // same database call as the invitation.
  const create = useMutation({
    mutationFn: (request: {
      readonly input: CreateParticipantInvite;
      readonly questionStates: QuestionStates;
    }) =>
      createParticipantInvite(
        supabase,
        buildCreateParticipantInvitePayload(request.input, null, request.questionStates),
      ),
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

/**
 * The organization's question catalog, which plans her wizard (RAPP-307), for
 * the last step of a new invite (RAPP-618). Read fresh each time the sheet
 * opens; in memory only, under the `participants` root.
 */
export function useInviteIntakeCatalog(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['participants', user?.id ?? SIGNED_OUT, 'intake-catalog'],
    queryFn: () => fetchIntakeCatalog(supabase),
    enabled: enabled && user !== null,
    staleTime: 0,
  });
}
