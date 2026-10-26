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
import {
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

/** One form's page: the shared data and, for the team who reads them, its responses. */
export async function loadCustomForm(formId: string) {
  const data = await loadCustomForms();
  const responses: readonly CustomFormResponse[] = data.canReadResponses
    ? await fetchCustomFormResponses(supabase, formId)
    : [];
  return { ...data, responses };
}

export type CustomFormData = Awaited<ReturnType<typeof loadCustomForm>>;
