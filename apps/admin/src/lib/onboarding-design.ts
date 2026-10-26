/**
 * What the registration board and its screen editors load (RAPP-615,
 * RAPP-641): the catalog of screens and questions, the document step note,
 * and the seasons, for the season name the phone preview shows. The legal
 * texts' versions load on Textos legals (RAPP-694).
 *
 * A person who may not design the onboarding gets nothing loaded: the route
 * guard sends her away, and the database would refuse her anyway.
 */

import { supabase } from '@/lib/supabase';
import { fetchDocumentStepExplanation } from '@ramassa/shared/intake';
import { EMPTY_INTAKE_CATALOG, fetchIntakeCatalog } from '@ramassa/shared/intake-builder';
import { canDesignOnboarding, fetchMyPermissions } from '@ramassa/shared/permissions';
import { fetchSeasons } from '@ramassa/shared/seasons';

export async function loadOnboardingDesign() {
  const permissions = await fetchMyPermissions(supabase);
  if (!canDesignOnboarding(permissions)) {
    return {
      intakeCatalog: EMPTY_INTAKE_CATALOG,
      documentExplanation: null,
      seasons: [],
    };
  }
  const [intakeCatalog, documentExplanation, seasons] = await Promise.all([
    fetchIntakeCatalog(supabase),
    fetchDocumentStepExplanation(supabase),
    fetchSeasons(supabase),
  ]);
  return { intakeCatalog, documentExplanation, seasons };
}

export type OnboardingDesignData = Awaited<ReturnType<typeof loadOnboardingDesign>>;
