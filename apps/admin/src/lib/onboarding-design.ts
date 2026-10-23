/**
 * What the registration board and its screen editors load (RAPP-615,
 * RAPP-641): the catalog of screens and questions, the document step note,
 * the seasons with their authorization versions, and the app terms versions.
 *
 * A person who may not design the onboarding gets nothing loaded: the route
 * guard sends her away, and the database would refuse her anyway.
 */

import { supabase } from '@/lib/supabase';
import { fetchAuthorizationVersions } from '@ramassa/shared/authorization';
import { fetchAppTermsVersions, fetchDocumentStepExplanation } from '@ramassa/shared/intake';
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
      versions: [],
      termsVersions: [],
      canPublishTerms: false,
    };
  }
  const [intakeCatalog, documentExplanation, seasons, versions, termsVersions] = await Promise.all([
    fetchIntakeCatalog(supabase),
    fetchDocumentStepExplanation(supabase),
    fetchSeasons(supabase),
    fetchAuthorizationVersions(supabase),
    fetchAppTermsVersions(supabase),
  ]);
  return {
    intakeCatalog,
    documentExplanation,
    seasons,
    versions,
    termsVersions,
    // Publishing a legal text and importing a whole setup stay with admins.
    canPublishTerms: permissions.has('settings.organization'),
  };
}

export type OnboardingDesignData = Awaited<ReturnType<typeof loadOnboardingDesign>>;
