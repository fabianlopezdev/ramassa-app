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

import { createFormProgressKeeper } from '@/lib/form-progress-keeper';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  completeCustomForm,
  dismissCustomForm,
  EMPTY_CUSTOM_FORM_PROGRESS,
  fetchIntakeCatalog,
  fetchMyCustomAnswers,
  fetchMyCustomFormProgress,
  fetchMyCustomForms,
  fetchMyPutOffCustomFormIds,
  fetchMyStartedCustomFormIds,
  putOffCustomForm,
  saveCustomFormProgress,
  splitCustomFormsByPlace,
  type CustomFormAnswers,
  type CustomFormProgress,
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

const startedKey = (userId: string) => [PLAYER_FORMS_QUERY_ROOT, userId, 'started'] as const;

/**
 * The asks she started and left half way (RAPP-886), for the Continua mark.
 * A failed lookup shows every form as new, as before.
 */
export function useMyStartedCustomFormIds(): ReadonlySet<string> {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: startedKey(user?.id ?? 'signed-out'),
    queryFn: () => fetchMyStartedCustomFormIds(supabase),
    enabled: user !== null,
    retry: 1,
  });
  return useMemo(() => new Set(data ?? []), [data]);
}

/**
 * Her answers so far to one form and the screen she left it on (RAPP-886).
 * Kept in memory only, as her other answers are.
 */
export function useCustomFormProgress(responseId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [PLAYER_FORMS_QUERY_ROOT, user?.id ?? 'signed-out', 'progress', responseId],
    queryFn: () => fetchMyCustomFormProgress(supabase, responseId),
    enabled: user !== null && responseId !== '',
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Keeps her answers so far to one form as she walks it (RAPP-886). `kept` is
 * what the server holds when the walk opens. Saves never block the walk: one
 * that fails, or is skipped offline, is carried by the next.
 */
export function useKeepCustomFormProgress(responseId: string, kept: CustomFormProgress | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  return useMemo(() => {
    const keeper = createFormProgressKeeper({
      kept: kept ?? EMPTY_CUSTOM_FORM_PROGRESS,
      isOnline: () => onlineManager.isOnline(),
      save: async (progress) => {
        const result = await safeAsync(
          () => saveCustomFormProgress(supabase, responseId, progress),
          { code: 'DB-1' },
        );
        if (result.ok) await queryClient.invalidateQueries({ queryKey: startedKey(userId) });
        return result.ok;
      },
    });
    return (progress: CustomFormProgress) => void keeper.keep(progress);
  }, [kept, queryClient, responseId, userId]);
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
