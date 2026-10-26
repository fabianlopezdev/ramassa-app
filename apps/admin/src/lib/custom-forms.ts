/**
 * What the pages of the forms the team creates load (RAPP-700): the catalog
 * (the forms, their screens and what each screen asks), the seasons for the
 * responses' season names, and what this person may do. The people who
 * design Onboarding build forms; the team who reads the participants sees who
 * answered (participants.view) and sends a form (participants.view_personal).
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

export async function loadCustomForms() {
  const permissions = await fetchMyPermissions(supabase);
  const access = {
    canDesign: canDesignOnboarding(permissions),
    canReadResponses: permissions.has('participants.view'),
    canSend: permissions.has('participants.view_personal'),
  };
  if (!access.canDesign && !access.canReadResponses) {
    return { intakeCatalog: EMPTY_INTAKE_CATALOG, ...access };
  }
  return { intakeCatalog: await fetchIntakeCatalog(supabase), ...access };
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
