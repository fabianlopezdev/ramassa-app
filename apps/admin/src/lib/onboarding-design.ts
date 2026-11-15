/**
 * What the registration board and its screen editors load (RAPP-615,
 * RAPP-641): the catalog of screens and questions, the seasons, for the season name the phone preview shows, and the forms
 * chained after Onboarding (RAPP-703). A screen save never asks Correcció or
 * Nova versió: Onboarding is only for players who have not joined (RAPP-705).
 * The legal forms load their own versions.
 *
 * A person who may not design the onboarding gets nothing loaded: the route
 * guard sends her away, and the database would refuse her anyway.
 */

import { supabase } from '@/lib/supabase';
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
      seasons: [],
      formChain: DEFAULT_ONBOARDING_CHAIN,
    };
  }
  const [intakeCatalog, seasons, formChain] = await Promise.all([
    fetchIntakeCatalog(supabase),
    fetchSeasons(supabase),
    fetchOnboardingFormChain(supabase),
  ]);
  return { intakeCatalog, seasons, formChain };
}

export type OnboardingDesignData = Awaited<ReturnType<typeof loadOnboardingDesign>>;
