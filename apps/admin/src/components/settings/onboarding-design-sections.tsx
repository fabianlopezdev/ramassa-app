/**
 * The onboarding settings, wired to the database (RAPP-615): the question
 * builder, the document step note, the app terms (RAPP-613), and the seasons
 * with their authorization.
 *
 * Settings shows them in its tabs, and the onboarding page shows them on their
 * own, so the onboarding design role reaches them without the rest of
 * Settings. Each section owns its writes, so both places save the same way:
 * through the RPC, then a reload of the route, with a fresh authenticator code
 * where the database asks for one.
 */

import { useStepUp } from '@/components/auth/step-up';
import { AppTermsEditor } from '@/components/settings/app-terms-editor';
import { AuthorizationEditor } from '@/components/settings/authorization-editor';
import { BuiltinScreensEditor } from '@/components/settings/builtin-screens-editor';
import { DocumentExplanationForm } from '@/components/settings/document-explanation-form';
import { QuestionBuilder } from '@/components/settings/question-builder';
import { SeasonsPanel } from '@/components/settings/seasons-panel';
import { builtinQuestionOptions, QUESTION_LABEL_KEYS } from '@/lib/builtin-questions';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  publishAuthorizationVersion,
  type AuthorizationVersion,
} from '@ramassa/shared/authorization';
import {
  discardAppTermsDraft,
  publishAppTermsDraft,
  saveAppTermsDraft,
  saveDocumentStepExplanation,
  WIZARD_QUESTIONS,
  type AppTermsVersion,
} from '@ramassa/shared/intake';
import {
  archiveCustomQuestion,
  archiveIntakeScreen,
  reorderCustomQuestions,
  reorderIntakeScreens,
  saveBuiltinOverride,
  saveBuiltinQuestionRequired,
  saveBuiltinScreen,
  saveCustomQuestion,
  saveCustomQuestionRequired,
  saveIntakeScreen,
  saveWizardFlowOrder,
  uploadsAvailable,
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
      canStoreFiles={uploadsAvailable(mediaWorkerUrl)}
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
      onSaveBuiltinRequired={async (question, isRequired) => {
        await saveBuiltinQuestionRequired(supabase, question, isRequired);
        await reload();
      }}
      onSaveCustomRequired={async (questionId, isRequired) => {
        await saveCustomQuestionRequired(supabase, questionId, isRequired);
        await reload();
      }}
    />
  );
}

/**
 * The built-in screens (RAPP-612): their order with the organization's own
 * screens, and their wording in each language.
 */
export function OnboardingScreensSection({ catalog }: { readonly catalog: IntakeCatalog }) {
  const reload = useReload();
  return (
    <BuiltinScreensEditor
      catalog={catalog}
      onSaveScreen={async (draft) => {
        await saveBuiltinScreen(supabase, draft);
        await reload();
      }}
      onSaveOrder={async (order) => {
        await saveWizardFlowOrder(supabase, order);
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

/**
 * The app terms (RAPP-613). Onboarding designers write the draft; only
 * settings.organization publishes, because a publish asks every player again.
 */
export function OnboardingAppTermsSection({
  versions,
  canPublish,
}: {
  readonly versions: readonly AppTermsVersion[];
  readonly canPublish: boolean;
}) {
  const reload = useReload();
  const withStepUp = useStepUp();
  return (
    <AppTermsEditor
      versions={versions}
      canPublish={canPublish}
      onSaveDraft={async (content) => {
        await saveAppTermsDraft(supabase, content);
        await reload();
      }}
      onDiscardDraft={async () => {
        await discardAppTermsDraft(supabase);
        await reload();
      }}
      onPublish={async () => {
        const number = await withStepUp(() => publishAppTermsDraft(supabase));
        await reload();
        return number;
      }}
    />
  );
}
