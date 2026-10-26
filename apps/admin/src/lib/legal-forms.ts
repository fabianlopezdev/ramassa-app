/**
 * What the two legal forms load (RAPP-694, RAPP-696): the seasons with the
 * season authorization's versions, the app terms' versions, her onboarding
 * (for the phone previews' buttons and season questions) and how many players
 * finished it. Each form's board and its screens read the same data.
 * Onboarding designers write the drafts, and only settings.organization
 * saves them for the players.
 *
 * A person who may not design the onboarding gets nothing loaded: the route
 * guard sends her away, and the database would refuse her anyway.
 */

import { supabase } from '@/lib/supabase';
import { fetchAuthorizationVersions } from '@ramassa/shared/authorization';
import { fetchAppTermsVersions } from '@ramassa/shared/intake';
import {
  EMPTY_INTAKE_CATALOG,
  fetchIntakeCatalog,
  fetchOnboardingFinishedCount,
} from '@ramassa/shared/intake-builder';
import { canDesignOnboarding, fetchMyPermissions } from '@ramassa/shared/permissions';
import { fetchSeasons } from '@ramassa/shared/seasons';

export async function loadLegalForms() {
  const permissions = await fetchMyPermissions(supabase);
  if (!canDesignOnboarding(permissions)) {
    return {
      seasons: [],
      versions: [],
      termsVersions: [],
      intakeCatalog: EMPTY_INTAKE_CATALOG,
      finishedCount: 0,
      canPublish: false,
    };
  }
  const [seasons, versions, termsVersions, intakeCatalog, finishedCount] = await Promise.all([
    fetchSeasons(supabase),
    fetchAuthorizationVersions(supabase),
    fetchAppTermsVersions(supabase),
    fetchIntakeCatalog(supabase),
    fetchOnboardingFinishedCount(supabase),
  ]);
  return {
    seasons,
    versions,
    termsVersions,
    intakeCatalog,
    finishedCount,
    // Saving for the players asks them again, so it stays with admins.
    canPublish: permissions.has('settings.organization'),
  };
}

export type LegalFormsData = Awaited<ReturnType<typeof loadLegalForms>>;
