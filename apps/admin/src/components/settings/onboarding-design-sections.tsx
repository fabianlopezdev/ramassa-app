/**
 * The onboarding settings, wired to the database (RAPP-615): the question
 * builder, the document step note, and the seasons with their authorization.
 *
 * Settings shows them in its tabs, and the onboarding page shows them on their
 * own, so the onboarding design role reaches them without the rest of
 * Settings. Each section owns its writes, so both places save the same way:
 * through the RPC, then a reload of the route, with a fresh authenticator code
 * where the database asks for one.
 */

import { useStepUp } from '@/components/auth/step-up';
import { AuthorizationEditor } from '@/components/settings/authorization-editor';
import { DocumentExplanationForm } from '@/components/settings/document-explanation-form';
import { QuestionBuilder } from '@/components/settings/question-builder';
import { SeasonsPanel } from '@/components/settings/seasons-panel';
import { builtinQuestionOptions, QUESTION_LABEL_KEYS } from '@/lib/builtin-questions';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  publishAuthorizationVersion,
  type AuthorizationVersion,
} from '@ramassa/shared/authorization';
import { saveDocumentStepExplanation, WIZARD_QUESTIONS } from '@ramassa/shared/intake';
import {
  archiveCustomQuestion,
  archiveIntakeScreen,
  reorderCustomQuestions,
  reorderIntakeScreens,
  saveBuiltinOverride,
  saveCustomQuestion,
  saveIntakeScreen,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LocalizedText } from '@ramassa/shared/schemas';
import { createSeason, setCurrentSeason, type Season } from '@ramassa/shared/seasons';

function useReload() {
  const router = useRouter();
  return () => router.invalidate({ sync: true });
}

export function OnboardingQuestionsSection({ catalog }: { readonly catalog: IntakeCatalog }) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const reload = useReload();
  return (
    <QuestionBuilder
      catalog={catalog}
      builtins={WIZARD_QUESTIONS.map((question) => ({
        question,
        label: t(QUESTION_LABEL_KEYS[question] ?? question),
        options: builtinQuestionOptions(question, t),
      }))}
      onSaveScreen={async (draft) => {
        await saveIntakeScreen(supabase, draft);
        await reload();
      }}
      onArchiveScreen={async (id) => {
        await archiveIntakeScreen(supabase, id);
        await reload();
      }}
      onReorderScreens={async (afterScreen, ids) => {
        await reorderIntakeScreens(supabase, afterScreen, ids);
        await reload();
      }}
      onSaveQuestion={async (draft) => {
        await saveCustomQuestion(supabase, draft);
        await reload();
      }}
      onArchiveQuestion={async (id) => {
        await archiveCustomQuestion(supabase, id);
        await reload();
      }}
      onReorderQuestions={async (screenId, ids) => {
        await reorderCustomQuestions(supabase, screenId, ids);
        await reload();
      }}
      onSaveBuiltin={async (override) => {
        await saveBuiltinOverride(supabase, override);
        await reload();
      }}
    />
  );
}

export function OnboardingDocumentSection({
  explanation,
}: {
  readonly explanation: LocalizedText | null;
}) {
  const reload = useReload();
  return (
    <DocumentExplanationForm
      explanation={explanation}
      onSave={async (next) => {
        await saveDocumentStepExplanation(supabase, next);
        await reload();
      }}
    />
  );
}

export function OnboardingAuthorizationSection({
  seasons,
  versions,
}: {
  readonly seasons: readonly Season[];
  readonly versions: readonly AuthorizationVersion[];
}) {
  const reload = useReload();
  // Risky changes ask for a fresh authenticator code first (RAPP-235).
  const withStepUp = useStepUp();
  return (
    <>
      <SeasonsPanel
        seasons={seasons}
        onCreate={async (input) => {
          await withStepUp(() => createSeason(supabase, input));
          await reload();
        }}
        onSetCurrent={async (seasonId) => {
          await withStepUp(() => setCurrentSeason(supabase, seasonId));
          await reload();
        }}
      />
      <AuthorizationEditor
        versions={versions}
        onPublish={async (content) => {
          await withStepUp(() => publishAuthorizationVersion(supabase, content));
          await reload();
        }}
      />
    </>
  );
}
