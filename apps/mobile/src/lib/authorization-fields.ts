/**
 * The season authorization's Health screen (RAPP-698): the fields staff
 * placed on it, her health and her emergency contact among them, asked with
 * the generic field renderer.
 *
 * Read online and kept on the device, like the version itself, so a staff
 * tablet opens the form with no connection. Her own app also reads her saved
 * answers, filled in for her to confirm or change.
 */

import { privateStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  authorizationFieldId,
  authorizationQuestions,
  fetchIntakeCatalog,
  fetchMyCustomAnswers,
  type CustomAnswers,
  type CustomQuestion,
} from '@ramassa/shared/intake-builder';

export interface AuthorizationFields {
  readonly questions: readonly CustomQuestion[];
  readonly healthFieldId: string | null;
  /** Her saved answers to them; none on a tablet. */
  readonly answers: CustomAnswers;
}

const NO_FIELDS: AuthorizationFields = { questions: [], healthFieldId: null, answers: {} };

const storageKey = (userId: string) => `authorization-fields:${userId}`;

function keptFields(userId: string): AuthorizationFields | null {
  const raw = privateStorage.getString(storageKey(userId));
  if (raw === undefined) return null;
  try {
    const kept = JSON.parse(raw) as Partial<AuthorizationFields>;
    return Array.isArray(kept.questions)
      ? { questions: kept.questions, healthFieldId: kept.healthFieldId ?? null, answers: {} }
      : null;
  } catch {
    return null;
  }
}

/** The Health screen's fields, with her saved answers when `withMyAnswers`. */
export function useAuthorizationFields(enabled: boolean, withMyAnswers: boolean) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ['authorization-fields', userId ?? 'signed-out', withMyAnswers],
    queryFn: async (): Promise<AuthorizationFields> => {
      if (userId === null) return NO_FIELDS;
      try {
        const catalog = await fetchIntakeCatalog(supabase);
        const questions = authorizationQuestions(catalog);
        const healthFieldId = authorizationFieldId(catalog, 'health_info');
        privateStorage.set(storageKey(userId), JSON.stringify({ questions, healthFieldId }));
        const saved = withMyAnswers ? await fetchMyCustomAnswers(supabase) : {};
        const ids = new Set(questions.map((question) => question.id));
        const answers = Object.fromEntries(
          Object.entries(saved).filter(([id]) => ids.has(id)),
        ) as CustomAnswers;
        return { questions, healthFieldId, answers };
      } catch (error) {
        const kept = keptFields(userId);
        if (kept !== null) return kept;
        throw error;
      }
    },
    enabled: enabled && userId !== null,
    retry: 1,
  });
}
