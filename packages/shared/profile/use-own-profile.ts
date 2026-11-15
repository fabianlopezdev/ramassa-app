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
import { withGenericAnswers, type GenericFieldAnswers } from '../intake-builder/app-controls';
import { appAnswersFromForm, appFormToSend, isAppFormKey } from '../intake-builder/app-field-form';
import type { ProfileEdit, ProfileRecordWithFields } from '../schemas/profile';

/**
 * Her edit: the form's values, and what she gave the app fields her screen
 * asked with the generic renderer (RAPP-666).
 */
export type OwnProfileEdit = Partial<ProfileEdit> & { readonly generic?: GenericFieldAnswers };

export const ownProfileQueryKey = ['own-profile'] as const;
export const updateOwnProfileMutationKey = ['own-profile', 'update'] as const;
export const ownDeletionRequestQueryKey = ['own-deletion-request'] as const;

export function useOwnProfile() {
  return useQuery<ProfileRecordWithFields | null>({ queryKey: ownProfileQueryKey });
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

  return useMutation<unknown, Error, OwnProfileEdit, { previous: ProfileRecordWithFields | null }>({
    mutationKey: updateOwnProfileMutationKey,
    onMutate: async (edit) => {
      await queryClient.cancelQueries({ queryKey: ownProfileQueryKey });
      const previous =
        queryClient.getQueryData<ProfileRecordWithFields | null>(ownProfileQueryKey) ?? null;
      if (previous !== null) {
        queryClient.setQueryData<ProfileRecordWithFields>(
          ownProfileQueryKey,
          paintedEdit(previous, edit),
        );
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
 * The edit painted onto the cached record: her names and settings, and her
 * answers by field (RAPP-663). Only what the edit carries is painted, so a
 * partial edit does not blank what it never touched; an emptied answer is
 * removed.
 */
function paintedEdit(
  previous: ProfileRecordWithFields,
  edit: OwnProfileEdit,
): ProfileRecordWithFields {
  const keys = Object.keys(edit).filter(isAppFormKey);
  const written = withGenericAnswers(
    { answers: appAnswersFromForm(previous.fields, appFormToSend(edit, keys)) },
    edit.generic,
  ).answers;
  const answers: Record<string, unknown> = { ...previous.answers };
  for (const [id, value] of Object.entries(written)) {
    if (value === null) delete answers[id];
    else answers[id] = value;
  }
  return {
    ...previous,
    ...(edit.firstName === undefined ? {} : { first_name: edit.firstName }),
    ...(edit.lastName === undefined ? {} : { last_name: edit.lastName }),
    ...(edit.preferredLanguage === undefined ? {} : { preferred_language: edit.preferredLanguage }),
    ...(edit.mediaConsent === undefined ? {} : { media_consent: edit.mediaConsent }),
    answers,
  };
}
