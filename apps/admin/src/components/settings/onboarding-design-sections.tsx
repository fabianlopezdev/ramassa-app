/**
 * The onboarding settings, wired to the database (RAPP-615): the document
 * step note, the app terms (RAPP-613), and the seasons with their
 * authorization. Her screens and the fields they ask live on the Onboarding
 * board and the Fitxa (RAPP-641, RAPP-650).
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
import { DocumentExplanationForm } from '@/components/settings/document-explanation-form';
import { SeasonsPanel } from '@/components/settings/seasons-panel';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import {
  discardAuthorizationDraft,
  publishAuthorizationDraft,
  saveAuthorizationDraft,
  type AuthorizationVersion,
} from '@ramassa/shared/authorization';
import {
  discardAppTermsDraft,
  publishAppTermsDraft,
  saveAppTermsDraft,
  saveDocumentStepExplanation,
  type AppTermsVersion,
} from '@ramassa/shared/intake';
import type { LocalizedText } from '@ramassa/shared/schemas';
import { createSeason, setCurrentSeason, type Season } from '@ramassa/shared/seasons';

export function useReload() {
  const router = useRouter();
  return () => router.invalidate({ sync: true });
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

/**
 * The seasons and their authorization (RAPP-304, RAPP-614). Onboarding
 * designers write the draft; only settings.organization publishes it, because
 * a publish makes every player sign again.
 */
export function OnboardingAuthorizationSection({
  seasons,
  versions,
  canPublish,
}: {
  readonly seasons: readonly Season[];
  readonly versions: readonly AuthorizationVersion[];
  readonly canPublish: boolean;
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
        canPublish={canPublish}
        onSaveDraft={async (content) => {
          await saveAuthorizationDraft(supabase, content);
          await reload();
        }}
        onDiscardDraft={async () => {
          await discardAuthorizationDraft(supabase);
          await reload();
        }}
        onPublish={async () => {
          const number = await withStepUp(() => publishAuthorizationDraft(supabase));
          await reload();
          return number;
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
