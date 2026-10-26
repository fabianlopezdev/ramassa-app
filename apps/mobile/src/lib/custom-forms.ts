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
import { useAuth } from '@ramassa/shared/auth';
import {
  completeCustomForm,
  dismissCustomForm,
  fetchIntakeCatalog,
  fetchMyCustomAnswers,
  fetchMyCustomForms,
  type CustomFormAnswers,
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

/** Sends her answers to a form, then reads her pending forms again. False when it failed. */
export function useAnswerCustomForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return async (responseId: string, answers: CustomFormAnswers): Promise<boolean> => {
    const result = await safeAsync(() => completeCustomForm(supabase, responseId, answers), {
      code: 'DB-1',
    });
    if (result.ok) {
      await queryClient.invalidateQueries({
        queryKey: [PLAYER_FORMS_QUERY_ROOT, user?.id ?? 'signed-out'],
      });
    }
    return result.ok;
  };
}

/** An optional form she does not want to answer leaves her Home. */
export function useDismissCustomForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return async (responseId: string): Promise<boolean> => {
    const result = await safeAsync(() => dismissCustomForm(supabase, responseId), {
      code: 'DB-1',
    });
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: pendingKey(user?.id ?? 'signed-out') });
    }
    return result.ok;
  };
}
