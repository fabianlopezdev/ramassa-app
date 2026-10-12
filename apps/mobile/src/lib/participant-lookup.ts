/**
 * Quick participant lookup (RAPP-247): find a woman by name, town or entity
 * at the pitch, and see her card. Both reads go through the database's field
 * levels (RAPP-240): `list_participants` and `get_participant_profile` return a
 * field empty when the caller may not see it, so the card shows only what
 * comes back. Both stay in memory: neither root is on the disk allow-list.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDeferredValue } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchParticipantDetail,
  fetchParticipants,
  participantSearchSchema,
} from '@ramassa/shared/participants';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

/** Fewer letters than this matches half the roster and says little. */
export const LOOKUP_MIN_LENGTH = 2;

/**
 * Opening a card writes an audit row (who looked at whose record), so the card
 * is not fetched again on every focus.
 */
const CARD_STALE_MS = 5 * 60_000;

export function useParticipantLookup(query: string) {
  const { user } = useAuth();
  const term = useDeferredValue(query.trim());
  return useQuery({
    queryKey: ['participants', user?.id ?? SIGNED_OUT, 'lookup', term],
    queryFn: () => fetchParticipants(supabase, participantSearchSchema.parse({ q: term })),
    enabled: user !== null && term.length >= LOOKUP_MIN_LENGTH,
    placeholderData: keepPreviousData,
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
