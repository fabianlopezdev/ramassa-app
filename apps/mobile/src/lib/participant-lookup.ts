/**
 * Participants on the phone (RAPP-247, list since RAPP-280, editing since
 * RAPP-281): the roster with search, filters and sorting, her card, and the
 * writes the card offers. Both reads go through the
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
import { setForumPostingDisabled } from '@ramassa/shared/forum';
import {
  fetchParticipantDetail,
  fetchParticipantFilterOptions,
  fetchParticipants,
  PARTICIPANT_PAGE_SIZE,
  setParticipantActive,
  updateParticipantProfile,
} from '@ramassa/shared/participants';
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
    mutationFn: (payload: UpdateOwnProfilePayload) =>
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
