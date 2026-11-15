/**
 * The old addresses of the season authorization's screens (RAPP-696):
 * `/forms/authorization/<step>`. The authorization is a form of the engine
 * since RAPP-773: `reregistration` and `reregistrationSeason` open its two
 * re-registration screens, `document` the screen holding the season
 * documents, `health` its first other screen, `consents` the screen she
 * signs. Anything else opens the form's page.
 * `ssr: false` for the reason every staff screen gives (the session lives in
 * localStorage, ADR-005).
 */

import { supabase } from '@/lib/supabase';
import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  authorizationForm,
  fetchIntakeCatalog,
  type CustomFormScreen,
} from '@ramassa/shared/intake-builder';

/** The screen an old step name stands for, among the form's screens. */
function screenOfStep(
  screens: readonly CustomFormScreen[],
  step: string,
): CustomFormScreen | undefined {
  const own = screens.filter((screen) => screen.systemScreen === undefined);
  switch (step) {
    case 'reregistration':
      return screens.find((screen) => screen.systemScreen === 'reregistration');
    case 'reregistrationSeason':
      return screens.find((screen) => screen.systemScreen === 'reregistration_season');
    case 'consents':
      return screens.find((screen) => screen.systemScreen === 'authorization_sign');
    case 'document':
      return own.find((screen) => screen.attachments !== undefined);
    case 'health':
      return own.find((screen) => screen.attachments === undefined);
    default:
      return undefined;
  }
}

export const Route = createFileRoute('/_staff/forms/authorization/$step')({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const catalog = await fetchIntakeCatalog(supabase).catch(() => null);
    const form = catalog === null ? undefined : authorizationForm(catalog);
    if (form === undefined) throw redirect({ to: '/forms/legal', replace: true });
    const screen = screenOfStep(form.screens, params.step);
    throw screen === undefined
      ? redirect({ to: '/forms/custom/$formId', params: { formId: form.id }, replace: true })
      : redirect({
          to: '/forms/custom/$formId/screens/$screenId',
          params: { formId: form.id, screenId: screen.id },
          replace: true,
        });
  },
});
