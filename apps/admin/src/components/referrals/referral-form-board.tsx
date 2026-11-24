/**
 * Entitats › Formulari de derivació (RAPP-652, RAPP-938): what an entity
 * fills in when it refers a woman, on the board every form has. Its screens
 * are drawn as phones, the add card first; each card opens its screen in the
 * shared screen editor; a drag reorders them. Every save is what the entity
 * fills in next: the referral form has no published versions.
 *
 * Its screens always show and depend on no answer, because the database
 * requires every required field of the form. A screen that asks her names is
 * never deleted: a referral names her.
 */

import { formBoardNumbers, FormScreenPhone } from '@/components/custom-forms/custom-form-page';
import { AddScreenCard, FormBoard, type BoardCard } from '@/components/onboarding/screen-board';
import { customFormDeletion } from '@/components/onboarding/screen-deletion';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { asksHerNames, referralFormView } from '@/lib/referral-form';
import { supabase } from '@/lib/supabase';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  reorderCustomFormScreens,
  saveCustomFormScreen,
  textIn,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function ReferralFormBoard({ catalog }: { readonly catalog: IntakeCatalog }) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const reload = useReload();
  const createScreen = useCreateReferralScreen();
  const view = referralFormView(catalog);
  if (view === null) {
    return <p className="text-start text-sm text-muted-foreground">{t('customForms.notFound')}</p>;
  }
  const { form } = view;
  const numbers = formBoardNumbers(view.catalog, form);
  const cards: BoardCard[] = form.screens.map((screen) => {
    const deletion = asksHerNames(catalog, screen.id)
      ? undefined
      : customFormDeletion(view.catalog, form, screen.id, language, numbers);
    return {
      key: screen.id,
      name: textIn(screen.title, language),
      miniature: <FormScreenPhone catalog={view.catalog} screen={screen} fill={undefined} />,
      status: null,
      ...(deletion === undefined ? {} : { deletion }),
      link: {
        to: '/entities/referral-form/screens/$screenId',
        params: { screenId: screen.id },
      },
    };
  });
  return (
    <FormBoard
      // Keyed by the saved order: a reload starts again from what the database holds.
      key={form.screens.map((screen) => screen.id).join('|')}
      label={textIn(form.name, language)}
      movable={cards}
      addCard={
        <AddScreenCard
          catalog={view.catalog}
          sources={[]}
          canDepend={false}
          onCreate={(name) => createScreen(form.id, name)}
        />
      }
      onReorder={async (keys) => {
        await reorderCustomFormScreens(supabase, form.id, keys);
        await reload();
      }}
    />
  );
}

/** A new screen of the referral form, made from its Catalan name; then its editor opens. */
export function useCreateReferralScreen(): (formId: string, name: string) => Promise<void> {
  const navigate = useNavigate();
  return async (formId, name) => {
    // The title is stored in Catalan, the language every other one falls back to.
    const id = await saveCustomFormScreen(supabase, {
      id: null,
      formId,
      title: { ca: name },
      intro: null,
    });
    await navigate({ to: '/entities/referral-form/screens/$screenId', params: { screenId: id } });
  };
}
