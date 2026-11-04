/**
 * What the season authorization's board and screens load (RAPP-694,
 * RAPP-696): the seasons with its versions and her onboarding (for the phone
 * previews' buttons and season questions). The app terms are a form of the
 * engine since RAPP-772 and load with the forms (`lib/custom-forms`).
 * Onboarding designers write the drafts, and only settings.organization
 * saves them for the players.
 *
 * A person who may not design the onboarding gets nothing loaded: the route
 * guard sends her away, and the database would refuse her anyway.
 */

import { supabase } from '@/lib/supabase';
import { fetchAuthorizationVersions } from '@ramassa/shared/authorization';
import { EMPTY_INTAKE_CATALOG, fetchIntakeCatalog } from '@ramassa/shared/intake-builder';
import { canDesignOnboarding, fetchMyPermissions } from '@ramassa/shared/permissions';
import { fetchSeasons } from '@ramassa/shared/seasons';

export async function loadLegalForms() {
  const permissions = await fetchMyPermissions(supabase);
  if (!canDesignOnboarding(permissions)) {
    return {
      seasons: [],
      versions: [],
      intakeCatalog: EMPTY_INTAKE_CATALOG,
      canPublish: false,
    };
  }
  const [seasons, versions, intakeCatalog] = await Promise.all([
    fetchSeasons(supabase),
    fetchAuthorizationVersions(supabase),
    fetchIntakeCatalog(supabase),
  ]);
  return {
    seasons,
    versions,
    intakeCatalog,
    // Saving for the players asks them again, so it stays with admins.
    canPublish: permissions.has('settings.organization'),
  };
}

export type LegalFormsData = Awaited<ReturnType<typeof loadLegalForms>>;
