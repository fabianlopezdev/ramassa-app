/**
 * Mentoring requests on the phone (RAPP-382), for `mentoring.manage` holders,
 * as the web admin's queue: every request with its private topic details, the
 * topics asked for, and the team's actions. Scheduling sets the time in Madrid,
 * the team member who will meet her and the team's private notes, and tells
 * her; a scheduled session can be marked completed. Kept in memory: the topic
 * details are private and never cached on the disk.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  completeMentoringRequest,
  fetchStaffMentoringRequests,
  scheduleMentoringRequest,
} from '@ramassa/shared/mentoring';
import { fetchConversationStaff } from '@ramassa/shared/messaging';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

const mentoringRoot = (userId: string) => ['team', userId, 'mentoring'] as const;

export function useStaffMentoringRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...mentoringRoot(user?.id ?? SIGNED_OUT), 'requests'],
    queryFn: ({ signal }) => fetchStaffMentoringRequests(supabase, signal),
    enabled: user !== null,
  });
}

/** The team members a session can be assigned to. */
export function useMentoringStaff() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...mentoringRoot(user?.id ?? SIGNED_OUT), 'staff'],
    queryFn: ({ signal }) => fetchConversationStaff(supabase, signal),
    enabled: user !== null,
  });
}

export function useMentoringActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: mentoringRoot(user?.id ?? SIGNED_OUT) });
  const schedule = useMutation({
    mutationFn: (input: {
      readonly requestId: string;
      readonly scheduledAt: string;
      readonly assignedStaffId: string;
      readonly staffNotes: string;
    }) =>
      scheduleMentoringRequest(supabase, {
        ...input,
        // A stored time comes back with an offset, which the schema refuses.
        scheduledAt: new Date(input.scheduledAt).toISOString(),
      }),
    onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: (requestId: string) => completeMentoringRequest(supabase, requestId),
    onSuccess: refresh,
  });
  return { schedule, complete };
}
