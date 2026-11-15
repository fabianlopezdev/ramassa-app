/**
 * The old addresses of the app terms' two screens (RAPP-696):
 * `/forms/terms/terms-intro` and `/forms/terms/terms`. The app terms are a
 * form of the engine since RAPP-772: `terms` opens its screen she signs, and
 * `terms-intro` its first screen when that one comes before it. Anything else
 * opens the form's page.
 * `ssr: false` for the reason every staff screen gives (the session lives in
 * localStorage, ADR-005).
 */

import { supabase } from '@/lib/supabase';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { fetchIntakeCatalog } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/forms/terms/$step')({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const catalog = await fetchIntakeCatalog(supabase).catch(() => null);
    const form = (catalog?.customForms ?? []).find((each) => each.systemKey === 'app_terms');
    if (form === undefined) throw redirect({ to: '/forms/legal', replace: true });
    const screens = form.screens.filter((screen) => screen.isHidden !== true);
    const first = screens[0];
    const screen =
      params.step === 'terms'
        ? screens.find((each) => each.systemScreen === 'terms_sign')
        : params.step === 'terms-intro' && first?.systemScreen === undefined
          ? first
          : undefined;
    throw screen === undefined
      ? redirect({ to: '/forms/custom/$formId', params: { formId: form.id }, replace: true })
      : redirect({
          to: '/forms/custom/$formId/screens/$screenId',
          params: { formId: form.id, screenId: screen.id },
          replace: true,
        });
  },
});
