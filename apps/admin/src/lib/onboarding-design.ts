/**
 * What the registration board and its screen editors load (RAPP-615,
 * RAPP-641): the catalog of screens and questions, the document step note,
 * the seasons, for the season name the phone preview shows, and how many
 * players finished Onboarding, so a save asks Correcció or Nova versió once
 * anyone has (RAPP-696), and the forms chained after Onboarding (RAPP-703).
 * The legal forms load their own versions.
 *
 * A person who may not design the onboarding gets nothing loaded: the route
 * guard sends her away, and the database would refuse her anyway.
 */

import { supabase } from '@/lib/supabase';
import { fetchDocumentStepExplanation } from '@ramassa/shared/intake';
import {
  DEFAULT_ONBOARDING_CHAIN,
  EMPTY_INTAKE_CATALOG,
  fetchIntakeCatalog,
  fetchOnboardingFinishedCount,
  fetchOnboardingFormChain,
} from '@ramassa/shared/intake-builder';
import { canDesignOnboarding, fetchMyPermissions } from '@ramassa/shared/permissions';
import { fetchSeasons } from '@ramassa/shared/seasons';

export async function loadOnboardingDesign() {
  const permissions = await fetchMyPermissions(supabase);
  if (!canDesignOnboarding(permissions)) {
    return {
      intakeCatalog: EMPTY_INTAKE_CATALOG,
      documentExplanation: null,
      seasons: [],
      finishedCount: 0,
      formChain: DEFAULT_ONBOARDING_CHAIN,
    };
  }
  const [intakeCatalog, documentExplanation, seasons, finishedCount, formChain] = await Promise.all(
    [
      fetchIntakeCatalog(supabase),
      fetchDocumentStepExplanation(supabase),
      fetchSeasons(supabase),
      fetchOnboardingFinishedCount(supabase),
      fetchOnboardingFormChain(supabase),
    ],
  );
  return { intakeCatalog, documentExplanation, seasons, finishedCount, formChain };
}

export type OnboardingDesignData = Awaited<ReturnType<typeof loadOnboardingDesign>>;
