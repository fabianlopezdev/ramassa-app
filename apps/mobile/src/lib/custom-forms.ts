/**
 * The forms the team creates (RAPP-700) on her phone: the ones she still has
 * to answer, the form she opens, and answering or dismissing one.
 *
 * A pending form shows first on Home and in her notifications. One that is
 * required to use the app (now, or since its date) opens before anything
 * else, after the terms, the authorization and the Onboarding review. A
 * failed lookup lets her in, as every gate does: a network flake must never
 * lock out a player who already joined.
 */

import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  completeCustomForm,
  dismissCustomForm,
  fetchIntakeCatalog,
  fetchMyCustomAnswers,
  fetchMyCustomForms,
  fetchMyPutOffCustomFormIds,
  putOffCustomForm,
  splitCustomFormsByPlace,
  type CustomFormAnswers,
  type CustomFormsByPlace,
} from '@ramassa/shared/intake-builder';

/** The query root a form's notification refreshes (`push-deep-link`). */
const PLAYER_FORMS_QUERY_ROOT = 'player-forms';

const pendingKey = (userId: string) => [PLAYER_FORMS_QUERY_ROOT, userId, 'pending'] as const;

/** Her pending forms, the ones that keep her from the app first. */
export function useMyCustomForms(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: pendingKey(user?.id ?? 'signed-out'),
    queryFn: () => fetchMyCustomForms(supabase),
    enabled: enabled && user !== null,
    retry: 1,
    refetchOnMount: 'always',
  });
}

/**
 * Her open forms by where they wait (RAPP-833): in Per fer, or in her later
 * list after "Ara no". A failed lookup of the later list leaves every form in
 * Per fer.
 */
export function useMyCustomFormsByPlace(): CustomFormsByPlace {
  const { user } = useAuth();
  const { data: forms } = useMyCustomForms(true);
  const { data: putOffIds } = useQuery({
    queryKey: [PLAYER_FORMS_QUERY_ROOT, user?.id ?? 'signed-out', 'put-off'],
    queryFn: () => fetchMyPutOffCustomFormIds(supabase),
    enabled: user !== null,
    retry: 1,
  });
  return useMemo(() => splitCustomFormsByPlace(forms, putOffIds), [forms, putOffIds]);
}

/** What a form needs on her phone: the catalog (its screens and fields) and her saved answers. */
export function useCustomFormSource(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [PLAYER_FORMS_QUERY_ROOT, user?.id ?? 'signed-out', 'source'],
    queryFn: async () => {
      const [catalog, answers] = await Promise.all([
        fetchIntakeCatalog(supabase),
        fetchMyCustomAnswers(supabase),
      ]);
      return { catalog, answers };
    },
    enabled: enabled && user !== null,
    staleTime: 0,
  });
}

/** Sends her answers to a form, then reads her pending forms again. The failure's code, else null. */
export function useAnswerCustomForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return async (responseId: string, answers: CustomFormAnswers): Promise<AppErrorCode | null> => {
    const result = await safeAsync(() => completeCustomForm(supabase, responseId, answers), {
      code: 'DB-1',
    });
    if (!result.ok) return result.error.code;
    await queryClient.invalidateQueries({
      queryKey: [PLAYER_FORMS_QUERY_ROOT, user?.id ?? 'signed-out'],
    });
    return null;
  };
}

/** Runs one change to an ask of hers, then reads her forms again. True when it went through. */
function useCustomFormChange(change: (responseId: string) => Promise<void>) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return async (responseId: string): Promise<boolean> => {
    const result = await safeAsync(() => change(responseId), { code: 'DB-1' });
    if (result.ok) {
      await queryClient.invalidateQueries({
        queryKey: [PLAYER_FORMS_QUERY_ROOT, user?.id ?? 'signed-out'],
      });
    }
    return result.ok;
  };
}

/** "Ara no" (RAPP-833): an optional form leaves Per fer and waits in her later list. */
export function usePutOffCustomForm() {
  return useCustomFormChange((responseId) => putOffCustomForm(supabase, responseId));
}

/** She deletes an optional form: it is closed for good and the team sees it as discarded. */
export function useDismissCustomForm() {
  return useCustomFormChange((responseId) => dismissCustomForm(supabase, responseId));
}
