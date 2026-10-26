/**
 * The onboarding settings, wired to the database (RAPP-615): the document
 * step note. Her screens and the fields they ask live on the Onboarding board
 * and the Fitxa (RAPP-641, RAPP-650); the app terms and the season
 * authorization are forms of their own (RAPP-694, RAPP-696).
 *
 * Settings shows the note in its tabs, and the onboarding page shows it on its
 * own, so the onboarding design role reaches it without the rest of Settings.
 * It saves through the RPC, then a reload of the route.
 */

import { DocumentExplanationForm } from '@/components/settings/document-explanation-form';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import { saveDocumentStepExplanation } from '@ramassa/shared/intake';
import type { LocalizedText } from '@ramassa/shared/schemas';

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
