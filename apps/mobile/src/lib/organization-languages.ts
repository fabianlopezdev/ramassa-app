/**
 * Switching one of the organization's languages on or off (RAPP-403), as the
 * web admin's settings do: the locked language (Catalan, for the grant) never
 * goes off, at least one language stays on, and turning off the default moves
 * the default to the first language still on. A pure module, so the unit
 * tests run without the app's Supabase client.
 */
import type { SupportedLanguage } from '@ramassa/shared/i18n';

export interface OrganizationLanguages {
  readonly available: readonly SupportedLanguage[];
  readonly defaultLanguage: SupportedLanguage;
}

export function toggleOrganizationLanguage(
  current: OrganizationLanguages,
  language: SupportedLanguage,
  locked: SupportedLanguage | null,
): OrganizationLanguages {
  if (language === locked) return current;
  if (!current.available.includes(language)) {
    return { ...current, available: [...current.available, language] };
  }
  const available = current.available.filter((entry) => entry !== language);
  const first = available[0];
  if (first === undefined) return current;
  return {
    available,
    defaultLanguage: current.defaultLanguage === language ? first : current.defaultLanguage,
  };
}
