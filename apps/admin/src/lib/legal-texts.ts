/**
 * What Textos legals loads (RAPP-694): the seasons with the season
 * authorization's versions, and the app terms' versions. The two editors moved
 * here from the Onboarding area, with the same people: onboarding designers
 * write the drafts, and only settings.organization publishes.
 *
 * A person who may not design the onboarding gets nothing loaded: the route
 * guard sends her away, and the database would refuse her anyway.
 */

import { supabase } from '@/lib/supabase';
import { fetchAuthorizationVersions } from '@ramassa/shared/authorization';
import { fetchAppTermsVersions } from '@ramassa/shared/intake';
import { canDesignOnboarding, fetchMyPermissions } from '@ramassa/shared/permissions';
import { fetchSeasons } from '@ramassa/shared/seasons';

/** The page's tabs, in order; the authorization is the default. */
export const LEGAL_TABS = ['authorization', 'terms'] as const;

export type LegalTab = (typeof LEGAL_TABS)[number];

export async function loadLegalTexts() {
  const permissions = await fetchMyPermissions(supabase);
  if (!canDesignOnboarding(permissions)) {
    return { seasons: [], versions: [], termsVersions: [], canPublish: false };
  }
  const [seasons, versions, termsVersions] = await Promise.all([
    fetchSeasons(supabase),
    fetchAuthorizationVersions(supabase),
    fetchAppTermsVersions(supabase),
  ]);
  return {
    seasons,
    versions,
    termsVersions,
    // A publish asks every player again, so it stays with admins.
    canPublish: permissions.has('settings.organization'),
  };
}
