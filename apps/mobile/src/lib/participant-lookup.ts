/**
 * Participants on the phone (RAPP-247, list since RAPP-280, editing since
 * RAPP-281, notes since RAPP-282): the roster with search, filters and
 * sorting, her card, the team's notes about her, and the writes the card
 * offers. Both reads go through the
 * database's field levels (RAPP-240): `list_participants` and
 * `get_participant_profile` return a field empty when the caller may not see
 * it, and ignore a filter on a field she may not read. Everything stays in
 * memory: the `participants` root is not on the disk allow-list.
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import { setForumPostingDisabled } from '@ramassa/shared/forum';
import {
  addParticipantNote,
  fetchParticipantActivity,
  fetchParticipantDetail,
  fetchParticipantFilterOptions,
  fetchParticipantNotes,
  fetchParticipants,
  PARTICIPANT_PAGE_SIZE,
  setParticipantActive,
  updateParticipantProfile,
} from '@ramassa/shared/participants';
import type { ProfilePrefillPayload } from '@ramassa/shared/participants';
import type { UpdateOwnProfilePayload } from '@ramassa/shared/schemas';
import type { ParticipantListSearch } from './participant-filters';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

/**
 * Opening a card writes an audit row (who looked at whose record), so the card
 * is not fetched again on every focus.
 */
const CARD_STALE_MS = 5 * 60_000;

/** The roster, a page at a time as she scrolls. */
export function useParticipantList(search: ParticipantListSearch) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ['participants', user?.id ?? SIGNED_OUT, 'list', search],
    queryFn: ({ pageParam }) => fetchParticipants(supabase, { ...search, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * PARTICIPANT_PAGE_SIZE < last.total ? pages.length + 1 : undefined,
    enabled: user !== null,
    placeholderData: keepPreviousData,
  });
}

export function useParticipantFilterOptions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['participants', user?.id ?? SIGNED_OUT, 'filter-options'],
    queryFn: () => fetchParticipantFilterOptions(supabase),
    enabled: user !== null,
  });
}

export function useParticipantCard(participantId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['participants', user?.id ?? SIGNED_OUT, 'card', participantId],
    queryFn: () => fetchParticipantDetail(supabase, participantId),
    enabled: user !== null && participantId.length > 0,
    staleTime: CARD_STALE_MS,
  });
}

/**
 * The card's writes: her record, her status and her forum posting. Each one
 * reloads the participant reads, so the card and the list show what the
 * database now holds, including what it normalised on the way in.
 */
export function useParticipantWrites(participantId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['participants', user?.id ?? SIGNED_OUT] });
  const updateProfile = useMutation({
    // A full record, or only the changed fields of a woman who has not joined yet (RAPP-300).
    mutationFn: (payload: UpdateOwnProfilePayload | ProfilePrefillPayload) =>
      updateParticipantProfile(supabase, participantId, payload),
    onSuccess: refresh,
  });
  const setActive = useMutation({
    mutationFn: (nextIsActive: boolean) =>
      setParticipantActive(supabase, participantId, nextIsActive),
    onSuccess: refresh,
  });
  const setForumPosting = useMutation({
    mutationFn: (disabled: boolean) => setForumPostingDisabled(supabase, participantId, disabled),
    onSuccess: refresh,
  });
  return { updateProfile, setActive, setForumPosting };
}

/**
 * The team's notes about her, newest first, for `participants.notes` holders.
 * Notes cannot be edited or deleted, so adding one is the only write.
 */
export function useParticipantNotes(participantId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['participants', user?.id ?? SIGNED_OUT, 'notes', participantId];
  const notes = useQuery({
    queryKey,
    queryFn: () => fetchParticipantNotes(supabase, participantId),
    enabled: user !== null && participantId.length > 0,
  });
  const addNote = useMutation({
    mutationFn: (body: string) => {
      if (user === null) throw new AppError('AUTH-1', { context: { reason: 'signed_out' } });
      return addParticipantNote(supabase, { participantId, authorId: user.id, body });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  return { notes, addNote };
}

/**
 * Her activity timeline (RAPP-283): attendance, sign-ups, services, messages,
 * feedback and referral updates, newest first. Each source's own policies
 * decide what the reader sees.
 */
export function useParticipantActivity(participantId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['participants', user?.id ?? SIGNED_OUT, 'activity', participantId],
    queryFn: () => fetchParticipantActivity(supabase, participantId),
    enabled: user !== null && participantId.length > 0,
  });
}
