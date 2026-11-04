/**
 * The old address of the app terms' board (RAPP-696). The app terms are a
 * form of the engine since RAPP-772: an old link, a bookmark or the menu opens
 * that form's page. Before the form exists, Condicions legals.
 * `ssr: false` for the reason every staff screen gives (the session lives in
 * localStorage, ADR-005).
 */

import { fetchAppTermsFormId } from '@/lib/custom-forms';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/forms/terms/')({
  ssr: false,
  beforeLoad: async () => {
    const formId = await fetchAppTermsFormId();
    throw formId === null
      ? redirect({ to: '/forms/legal', replace: true })
      : redirect({ to: '/forms/custom/$formId', params: { formId }, replace: true });
  },
});
