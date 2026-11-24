/**
 * Formularis › Formulari de suggeriments (RAPP-939): what a player fills in
 * when she sends the club a suggestion, on the board every form has. Its
 * screens are drawn as phones, the add card first; each card opens its screen
 * in the shared screen editor; a drag reorders them. Every save is what she
 * fills in next: the suggestions form has no published versions.
 *
 * Its first screen holds the suggestion's own parts (the type, the text and
 * the photo): it keeps its place and is never deleted. The other screens
 * always show and depend on no answer, as on the referral form.
 */

import { formBoardNumbers, FormScreenPhone } from '@/components/custom-forms/custom-form-page';
import { AddScreenCard, FormBoard, type BoardCard } from '@/components/onboarding/screen-board';
import { customFormDeletion } from '@/components/onboarding/screen-deletion';
import { useReload } from '@/components/settings/onboarding-design-sections';
import {
  feedbackFixedPhoneQuestions,
  feedbackFormView,
  isFeedbackMessageScreen,
} from '@/lib/feedback-form';
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

export function FeedbackFormBoard({ catalog }: { readonly catalog: IntakeCatalog }) {
  const { t, i18n } = useTranslation(['settings', 'feedback']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const reload = useReload();
  const createScreen = useCreateFeedbackScreen();
  const view = feedbackFormView(catalog);
  if (view === null) {
    return <p className="text-start text-sm text-muted-foreground">{t('customForms.notFound')}</p>;
  }
  const { form } = view;
  const numbers = formBoardNumbers(view.catalog, form);
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
          {...(isFeedbackMessageScreen(screen)
            ? { leadingQuestions: (shown) => feedbackFixedPhoneQuestions(shown, t) }
            : {})}
        />
      ),
      status: null,
      ...(deletion === undefined ? {} : { deletion }),
      link: { to: '/forms/feedback/screens/$screenId', params: { screenId: screen.id } },
    };
  };
  const fixed = form.screens.filter(isFeedbackMessageScreen);
  const movable = form.screens.filter((screen) => !isFeedbackMessageScreen(screen));
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

/** A new screen of the suggestions form, made from its Catalan name; then its editor opens. */
export function useCreateFeedbackScreen(): (formId: string, name: string) => Promise<void> {
  const navigate = useNavigate();
  return async (formId, name) => {
    // The title is stored in Catalan, the language every other one falls back to.
    const id = await saveCustomFormScreen(supabase, {
      id: null,
      formId,
      title: { ca: name },
      intro: null,
    });
    await navigate({ to: '/forms/feedback/screens/$screenId', params: { screenId: id } });
  };
}
