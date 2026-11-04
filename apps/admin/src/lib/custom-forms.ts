/**
 * What the pages of the forms the team creates load (RAPP-700): the catalog
 * (the forms, their screens and what each screen asks), the seasons a
 * repeating form is published to, and what this person may do. The people who
 * design Onboarding build and publish forms; the team who reads the
 * participants sees who answered (participants.view).
 *
 * A person who may do none of it gets nothing loaded: the route guard sends
 * her away, and the database would refuse her anyway.
 */

import { supabase } from '@/lib/supabase';
import { fetchAppTermsVersions, type AppTermsVersion } from '@ramassa/shared/intake';
import {
  customFormById,
  EMPTY_INTAKE_CATALOG,
  fetchCustomFormResponses,
  fetchIntakeCatalog,
  type CustomFormResponse,
} from '@ramassa/shared/intake-builder';
import { canDesignOnboarding, fetchMyPermissions } from '@ramassa/shared/permissions';
import { fetchSeasons } from '@ramassa/shared/seasons';

export async function loadCustomForms() {
  const permissions = await fetchMyPermissions(supabase);
  const access = {
    canDesign: canDesignOnboarding(permissions),
    canReadResponses: permissions.has('participants.view'),
    // A legal form asks every player again: an admin publishes it (RAPP-771).
    canPublishLegal: permissions.has('settings.organization'),
  };
  if (!access.canDesign && !access.canReadResponses) {
    return { intakeCatalog: EMPTY_INTAKE_CATALOG, seasons: [], ...access };
  }
  // The seasons a repeating form is published to (RAPP-701).
  const [intakeCatalog, seasons] = await Promise.all([
    fetchIntakeCatalog(supabase),
    fetchSeasons(supabase),
  ]);
  return { intakeCatalog, seasons, ...access };
}

export type CustomFormsData = Awaited<ReturnType<typeof loadCustomForms>>;

/**
 * One form's page: the shared data and, for the team who reads them, its
 * responses. The app terms (RAPP-772) are accepted in their own ledger: their
 * page reads its versions, with how many accepted each, and has no responses.
 */
export async function loadCustomForm(formId: string) {
  const data = await loadCustomForms();
  const isAppTerms = customFormById(data.intakeCatalog, formId)?.systemKey === 'app_terms';
  const [responses, termsVersions] = await Promise.all([
    data.canReadResponses && !isAppTerms
      ? fetchCustomFormResponses(supabase, formId)
      : Promise.resolve<readonly CustomFormResponse[]>([]),
    data.canDesign && isAppTerms
      ? fetchAppTermsVersions(supabase)
      : Promise.resolve<readonly AppTermsVersion[]>([]),
  ]);
  return { ...data, responses, termsVersions };
}

export type CustomFormData = Awaited<ReturnType<typeof loadCustomForm>>;

/**
 * The app terms' form (RAPP-772): where `/forms/terms` and the menu open it.
 * A small read of the forms table, as the menu's legal forms; null on a
 * database before RAPP-772.
 */
export async function fetchAppTermsFormId(signal?: AbortSignal): Promise<string | null> {
  let query = supabase.from('custom_forms').select('id').eq('system_key', 'app_terms').limit(1);
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) return null;
  return data?.[0]?.id ?? null;
}
