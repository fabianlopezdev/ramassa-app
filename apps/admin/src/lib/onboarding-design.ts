/**
 * What the registration board and its screen editors load (RAPP-615,
 * RAPP-641): the catalog of screens and questions, the document step note,
 * the seasons, for the season name the phone preview shows, and the forms
 * chained after Onboarding (RAPP-703). A screen save never asks Correcció or
 * Nova versió: Onboarding is only for players who have not joined (RAPP-705).
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
      formChain: DEFAULT_ONBOARDING_CHAIN,
    };
  }
  const [intakeCatalog, documentExplanation, seasons, formChain] = await Promise.all([
    fetchIntakeCatalog(supabase),
    fetchDocumentStepExplanation(supabase),
    fetchSeasons(supabase),
    fetchOnboardingFormChain(supabase),
  ]);
  return { intakeCatalog, documentExplanation, seasons, formChain };
}

export type OnboardingDesignData = Awaited<ReturnType<typeof loadOnboardingDesign>>;
