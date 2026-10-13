/**
 * GDPR on the phone (RAPP-286): participants' open deletion requests, her own
 * request on her card, and the two actions the web admin has, anonymize and
 * erase everything. Both run behind the step-up check, and erasing follows
 * ADR-023: her stored files first (the media worker writes the purge receipt
 * the database checks), then her record. The reads stay in memory: the
 * `participants` root is not on the disk allow-list.
 */
import { useStepUp } from '@/components/auth/step-up';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  anonymizeParticipant,
  deleteParticipantPermanently,
  eraseParticipant,
  fetchDeletionRequests,
  fetchOpenDeletionRequestFor,
} from '@ramassa/shared/rgpd';
import { purgeParticipantMedia } from '@ramassa/shared/upload-client';
import { mobileClientEnv, supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

export function useOpenDeletionRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['participants', user?.id ?? SIGNED_OUT, 'deletion-requests'],
    queryFn: () => fetchDeletionRequests(supabase, 'open'),
    enabled: user !== null,
  });
}

export function useParticipantDeletionRequest(participantId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['participants', user?.id ?? SIGNED_OUT, 'deletion-request', participantId],
    queryFn: () => fetchOpenDeletionRequestFor(supabase, participantId),
    enabled: user !== null && participantId.length > 0,
  });
}

export function useParticipantRgpdActions(participantId: string) {
  const { user } = useAuth();
  const withStepUp = useStepUp();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['participants', user?.id ?? SIGNED_OUT] });

  const anonymize = useMutation({
    mutationFn: () => withStepUp(() => anonymizeParticipant(supabase, participantId)),
    onSuccess: refresh,
  });
  const erase = useMutation({
    mutationFn: () =>
      withStepUp(async () => {
        const mediaWorkerUrl = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
        if (mediaWorkerUrl === undefined) {
          throw new AppError('UPLOAD-7', { message: 'No media worker for the purge' });
        }
        // Read at the moment of the call, so a session refreshed while the sheet
        // was open is the one used.
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (accessToken === undefined) throw new AppError('AUTH-2');
        const erased = await eraseParticipant(participantId, {
          purgeMedia: () => purgeParticipantMedia({ mediaWorkerUrl, accessToken, participantId }),
          deleteRecord: () => deleteParticipantPermanently(supabase, participantId),
        });
        if (!erased.ok) throw erased.error;
        return erased.value;
      }),
    onSuccess: refresh,
  });
  return { anonymize, erase };
}
