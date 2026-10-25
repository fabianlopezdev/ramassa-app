/**
 * The app fields an edit screen asks with the generic renderer (RAPP-666).
 *
 * Her own edit and the staff phone's edit draw the app's own controls (the
 * date boxes, the document cards, the size chips). Staff edit every field on
 * Dades de les jugadores: a field whose type, options or screen no longer fit
 * its control is off it (`questionsOffTheirControl`), exactly as her wizard
 * decides. The edit screen then hides that control and asks the question's
 * fields here, with the wizard's generic renderer and its checks, so a field
 * never disappears from an edit screen.
 *
 * The catalog is read fresh when the screen opens. When it cannot load, every
 * question keeps its app control, as before, and the failure is logged.
 */
import type { CustomAnswerDraft } from '@/components/onboarding/custom-question-field';
import { checkCustomAnswers } from '@/lib/custom-answer-errors';
import { logger } from '@/lib/observability';
import { customAnswersToSave, mergedCustomAnswers } from '@/lib/onboarding-intake';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import type { IntakeQuestion } from '@ramassa/shared/intake';
import {
  editScreenQuestions,
  EMPTY_INTAKE_CATALOG,
  fetchIntakeCatalog,
  questionsOffTheirControl,
  type CustomAnswers,
  type CustomAnswerValue,
  type GenericFieldAnswers,
} from '@ramassa/shared/intake-builder';

type Translate = Parameters<typeof checkCustomAnswers>[2];

const NONE_OFF: ReadonlySet<IntakeQuestion> = new Set();

export function useGenericAppFields({
  stored,
  showSensitive,
  enforceRequired,
  notOnThisScreen = NONE_OFF,
}: {
  /** Her stored answers by field id, as her record reads them. */
  readonly stored: Readonly<Record<string, unknown>>;
  /** False for a reader without `participants.view_sensitive`. */
  readonly showSensitive: boolean;
  /** False for the prefill of a woman who has not joined: only her names are required. */
  readonly enforceRequired: boolean;
  /** Questions this screen never asks, whatever their control. */
  readonly notOnThisScreen?: ReadonlySet<IntakeQuestion>;
}) {
  const { user } = useAuth();
  const catalog = useQuery({
    queryKey: ['edit-screen', user?.id ?? 'signed-out', 'intake-catalog'],
    queryFn: async () => {
      try {
        return await fetchIntakeCatalog(supabase);
      } catch (error) {
        logger.warn('edit_screen.catalog.load_failed', { error: toAppError(error) });
        return EMPTY_INTAKE_CATALOG;
      }
    },
    enabled: user !== null,
    staleTime: 0,
  });
  const layout = catalog.data?.layout;
  const questions = useMemo(
    () => (layout === undefined ? [] : editScreenQuestions(layout, showSensitive, notOnThisScreen)),
    [layout, showSensitive, notOnThisScreen],
  );
  const offTheirControl = useMemo(
    () => (layout === undefined ? NONE_OFF : questionsOffTheirControl(layout)),
    [layout],
  );
  const [draft, setDraft] = useState<CustomAnswerDraft>({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const storedAnswers = stored as CustomAnswers;
  const answers = mergedCustomAnswers(storedAnswers, draft);

  return {
    /** The catalog is still loading: the screen waits, so no control flashes. */
    isLoading: catalog.isPending && user !== null,
    questions,
    /** The app questions whose own control the screen hides. */
    offTheirControl,
    answers,
    errors,
    onChange: (questionId: string, value: CustomAnswerValue) => {
      setDraft((current) => ({ ...current, [questionId]: value }));
      setErrors((current) =>
        current[questionId] === undefined
          ? current
          : Object.fromEntries(Object.entries(current).filter(([id]) => id !== questionId)),
      );
    },
    /**
     * The wizard's check and tidying. Null while an answer does not fit its
     * question (the errors show at each field); otherwise what to send.
     */
    check: (t: Translate): GenericFieldAnswers | null => {
      const checked = checkCustomAnswers(questions, answers, t, { enforceRequired });
      setErrors(checked.errors);
      if (Object.keys(checked.errors).length > 0) return null;
      const tidied: CustomAnswerDraft = Object.fromEntries(
        Object.entries(draft).map(([id, value]) => [id, checked.answers[id] ?? value]),
      );
      return {
        fieldIds: questions.map((question) => question.id),
        answers: customAnswersToSave(questions, tidied, storedAnswers),
      };
    },
  };
}
