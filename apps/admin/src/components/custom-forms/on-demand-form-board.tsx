/**
 * The board of a form she sends when she wants (RAPP-939, RAPP-940): the
 * suggestions form and the mentoring form share it. Its screens are drawn as
 * phones, the add card first; each card opens its screen in the shared screen
 * editor; a drag reorders them. Every save is what she fills in next: these
 * forms have no published versions.
 *
 * Its first screen holds the request's own parts (for a suggestion the type,
 * the text and the photo; for a mentoring request the topic, the detail and
 * the preferred date and time): it keeps its place and is never deleted. The
 * other screens always show and depend on no answer, as on the referral form.
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { formBoardNumbers, FormScreenPhone } from '@/components/custom-forms/custom-form-page';
import { Page, PageHeader } from '@/components/layout/page';
import { AddScreenCard, FormBoard, type BoardCard } from '@/components/onboarding/screen-board';
import { customFormDeletion } from '@/components/onboarding/screen-deletion';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { ON_DEMAND_FORM_PERMISSIONS } from '@/lib/nav-items';
import {
  isOnDemandFixedScreen,
  onDemandFormView,
  type OnDemandFormDefinition,
} from '@/lib/on-demand-form';
import { supabase } from '@/lib/supabase';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  reorderCustomFormScreens,
  saveCustomFormScreen,
  textIn,
  type CustomFormScreen,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/**
 * The form's page: named as the menu names it, with its board. Staff who hold
 * settings.organization or onboarding.design edit it; the database checks
 * every change again.
 */
export function OnDemandFormBoardPage({
  definition,
  catalog,
}: {
  readonly definition: OnDemandFormDefinition;
  readonly catalog: IntakeCatalog;
}) {
  const { t } = useTranslation('nav');
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={ON_DEMAND_FORM_PERMISSIONS}>
      <Page data-testid={`${definition.key}-form-page`}>
        <PageHeader title={t(definition.nameKey)} />
        <OnDemandFormBoard definition={definition} catalog={catalog} />
      </Page>
    </RequireAuth>
  );
}

export function OnDemandFormBoard({
  definition,
  catalog,
}: {
  readonly definition: OnDemandFormDefinition;
  readonly catalog: IntakeCatalog;
}) {
  const { t, i18n } = useTranslation(['settings', definition.namespace]);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const reload = useReload();
  const createScreen = useCreateOnDemandScreen(definition);
  const view = onDemandFormView(catalog, definition.key);
  if (view === null) {
    return <p className="text-start text-sm text-muted-foreground">{t('customForms.notFound')}</p>;
  }
  const { form } = view;
  const numbers = formBoardNumbers(view.catalog, form);
  const isFixed = (screen: CustomFormScreen) => isOnDemandFixedScreen(definition, screen);
  const card = (screen: CustomFormScreen): BoardCard => {
    const deletion = customFormDeletion(view.catalog, form, screen.id, language, numbers);
    return {
      key: screen.id,
      name: textIn(screen.title, language),
      miniature: (
        <FormScreenPhone
          catalog={view.catalog}
          screen={screen}
          fill={undefined}
          {...(isFixed(screen)
            ? { leadingQuestions: (shown) => definition.fixedPhoneQuestions(shown, t) }
            : {})}
        />
      ),
      status: null,
      ...(deletion === undefined ? {} : { deletion }),
      link: { to: definition.screenPath, params: { screenId: screen.id } },
    };
  };
  const fixed = form.screens.filter(isFixed);
  const movable = form.screens.filter((screen) => !isFixed(screen));
  return (
    <FormBoard
      // Keyed by the saved order: a reload starts again from what the database holds.
      key={form.screens.map((screen) => screen.id).join('|')}
      label={textIn(form.name, language)}
      leading={fixed.map(card)}
      movable={movable.map(card)}
      addCard={
        <AddScreenCard
          catalog={view.catalog}
          sources={[]}
          canDepend={false}
          onCreate={(name) => createScreen(form.id, name)}
        />
      }
      onReorder={async (keys) => {
        // The fixed screen keeps its place, first.
        await reorderCustomFormScreens(supabase, form.id, [
          ...fixed.map((screen) => screen.id),
          ...keys,
        ]);
        await reload();
      }}
    />
  );
}

/** A new screen of the form, made from its Catalan name; then its editor opens. */
function useCreateOnDemandScreen(
  definition: OnDemandFormDefinition,
): (formId: string, name: string) => Promise<void> {
  const navigate = useNavigate();
  return async (formId, name) => {
    // The title is stored in Catalan, the language every other one falls back to.
    const id = await saveCustomFormScreen(supabase, {
      id: null,
      formId,
      title: { ca: name },
      intro: null,
    });
    await navigate({ to: definition.screenPath, params: { screenId: id } });
  };
}
