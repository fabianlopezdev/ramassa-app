/**
 * The old address of the season authorization's board (RAPP-696). The
 * authorization is a form of the engine since RAPP-773: an old link, a
 * bookmark or the menu opens that form's page. Before the form exists,
 * Condicions legals.
 * `ssr: false` for the reason every staff screen gives (the session lives in
 * localStorage, ADR-005).
 */

import { fetchSystemFormId } from '@/lib/custom-forms';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/forms/authorization/')({
  ssr: false,
  beforeLoad: async () => {
    const formId = await fetchSystemFormId('season_authorization');
    throw formId === null
      ? redirect({ to: '/forms/legal', replace: true })
      : redirect({ to: '/forms/custom/$formId', params: { formId }, replace: true });
  },
});
