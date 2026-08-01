/**
 * The profile query and its optimistic edit (RAPP-22).
 *
 * The query function and the mutation function are supplied by the app (via
 * `setQueryDefaults` / `setMutationDefaults` on its own client), not imported
 * here: this package must not reach for a Supabase client, and doing it this way
 * also lets the tests drive a failing write without mocking the network.
 *
 * The edit is optimistic because the audience is on patchy mobile data and a
 * form that freezes until the server answers reads as broken. The important
 * half is the ROLLBACK: a cache still holding the optimistic value after a
 * failed write tells a woman her new phone number is saved when it is not, and
 * she finds out when the team cannot reach her.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileEdit, ProfileRow } from '../schemas/profile';

export const ownProfileQueryKey = ['own-profile'] as const;
export const updateOwnProfileMutationKey = ['own-profile', 'update'] as const;
export const ownDeletionRequestQueryKey = ['own-deletion-request'] as const;

export function useOwnProfile() {
  return useQuery<ProfileRow | null>({ queryKey: ownProfileQueryKey });
}

/** The pending erasure request, so the screen can say it arrived. */
export function useOwnDeletionRequest() {
  return useQuery<{ id: string; state: string; created_at: string } | null>({
    queryKey: ownDeletionRequestQueryKey,
  });
}

/**
 * The optimistic edit. `onMutate` paints the new values and keeps the previous
 * row; `onError` puts the previous row back; `onSettled` refetches so the cache
 * ends up holding what the SERVER has rather than what the client hoped, which
 * matters because the RPC normalizes some fields (dependants forced to zero,
 * document number upper-cased) and the optimistic copy would otherwise disagree
 * with the database until the next cold start.
 */
export function useUpdateOwnProfile() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, Partial<ProfileEdit>, { previous: ProfileRow | null }>({
    mutationKey: updateOwnProfileMutationKey,
    onMutate: async (edit) => {
      await queryClient.cancelQueries({ queryKey: ownProfileQueryKey });
      const previous = queryClient.getQueryData<ProfileRow | null>(ownProfileQueryKey) ?? null;
      if (previous !== null) {
        queryClient.setQueryData<ProfileRow>(ownProfileQueryKey, {
          ...previous,
          ...toRowShape(edit),
        });
      }
      return { previous };
    },
    onError: (_error, _edit, context) => {
      if (context !== undefined) {
        queryClient.setQueryData(ownProfileQueryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ownProfileQueryKey });
    },
  });
}

/**
 * The camelCase form values painted onto the snake_case cached row. Only the
 * keys the edit actually carries are mapped, so a partial edit does not blank
 * the fields it never touched.
 */
function toRowShape(edit: Partial<ProfileEdit>): Partial<ProfileRow> {
  const row: Partial<ProfileRow> = {};
  if (edit.firstName !== undefined) row.first_name = edit.firstName;
  if (edit.lastName !== undefined) row.last_name = edit.lastName;
  if (edit.dateOfBirth !== undefined) row.date_of_birth = edit.dateOfBirth;
  if (edit.placeOfBirth !== undefined) row.place_of_birth = edit.placeOfBirth;
  if (edit.nationality !== undefined) row.nationality = edit.nationality;
  if (edit.preferredLanguage !== undefined) row.preferred_language = edit.preferredLanguage;
  if (edit.documentType !== undefined) row.document_type = edit.documentType;
  if (edit.documentNumber !== undefined) row.document_number = edit.documentNumber;
  if (edit.phone !== undefined) row.phone = edit.phone;
  if (edit.address !== undefined) row.address = edit.address;
  if (edit.city !== undefined) row.city = edit.city;
  if (edit.postalCode !== undefined) row.postal_code = edit.postalCode;
  if (edit.referenceEntity !== undefined) row.reference_entity = edit.referenceEntity;
  if (edit.referenceContactName !== undefined) {
    row.reference_contact_name = edit.referenceContactName;
  }
  if (edit.hasDependents !== undefined) row.has_dependents = edit.hasDependents;
  if (edit.numDependents !== undefined) row.num_dependents = edit.numDependents;
  if (edit.clothingSize !== undefined) row.clothing_size = edit.clothingSize;
  if (edit.shoeSize !== undefined) row.shoe_size = edit.shoeSize;
  if (edit.mediaConsent !== undefined) row.media_consent = edit.mediaConsent;
  return row;
}
