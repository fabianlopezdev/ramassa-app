/**
 * One screen of the referral form (RAPP-938), opened from its card: the
 * shared screen editor (`StaffScreenEditor`) with its title, intro, help and
 * button, beside the phone, and the fields and signature blocks it asks
 * (`ReferralScreenFields`). Every save is what the entity fills in next.
 * The screen always shows and depends on no answer; one that asks her names
 * is never deleted.
 */

import { DRAFT_SAVE, formBoardNumbers } from '@/components/custom-forms/custom-form-page';
import { Page } from '@/components/layout/page';
import { placedPhoneQuestions } from '@/components/onboarding/screen-content';
import { customFormDeletion, DeleteScreenAction } from '@/components/onboarding/screen-deletion';
import {
  ScreenEditorHeading,
  StaffScreenEditor,
  type SiblingScreen,
} from '@/components/onboarding/screen-editor';
import { asksHerNames, referralFormView } from '@/lib/referral-form';
import { supabase } from '@/lib/supabase';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  saveCustomFormScreen,
  textIn,
  type CustomFormScreen,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { ReferralScreenFields } from './referral-screen-fields';

export function ReferralFormScreenEditor({
  catalog,
  screenId,
}: {
  readonly catalog: IntakeCatalog;
  readonly screenId: string;
}) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const navigate = useNavigate();
  const view = referralFormView(catalog);
  const screens = view?.form.screens ?? [];
  const index = screens.findIndex((each) => each.id === screenId);
  const screen = index < 0 ? undefined : screens[index];
  const deletion =
    view === null || screen === undefined || asksHerNames(catalog, screen.id)
      ? undefined
      : customFormDeletion(
          view.catalog,
          view.form,
          screen.id,
          language,
          formBoardNumbers(view.catalog, view.form),
        );
  return (
    <Page data-testid="referral-form-screen-page">
      <ScreenEditorHeading
        back={{ to: '/entities/referral-form', label: t('referralForm.title') }}
        siblings={
          screen === undefined
            ? undefined
            : {
                previous: referralSibling(screens[index - 1], language),
                next: referralSibling(screens[index + 1], language),
              }
        }
        title={screen === undefined ? t('customForms.notFound') : textIn(screen.title, language)}
        position={
          screen === undefined
            ? undefined
            : t('customForms.screenOf', { number: index + 1, total: screens.length })
        }
      />
      {view === null || screen === undefined ? null : (
        <StaffScreenEditor
          // Keyed by the screen: another screen starts from what is saved.
          key={screen.id}
          screen={screen}
          number={index + 1}
          total={screens.length}
          saveKind={DRAFT_SAVE}
          hide={{
            isHidden: false,
            lockReason: t('referralForm.alwaysShown'),
            save: async () => undefined,
          }}
          phoneQuestions={(shown, wording) =>
            placedPhoneQuestions(view.catalog, screen.id, shown, wording, 'custom_form')
          }
          onStore={(title, intro, texts) =>
            saveCustomFormScreen(supabase, {
              id: screen.id,
              formId: view.form.id,
              title,
              intro,
              texts,
            })
          }
          fields={(row, editorLanguage) => (
            <ReferralScreenFields
              catalog={catalog}
              screenKey={screen.id}
              language={editorLanguage}
              editing={row.editing}
              onEdit={row.setEditing}
              onWordingChange={row.setWording}
            />
          )}
        />
      )}
      {deletion === undefined ? null : (
        <div className="flex justify-end">
          <DeleteScreenAction
            key={deletion.key}
            deletion={deletion}
            variant="button"
            onDeleted={() => navigate({ to: '/entities/referral-form' })}
          />
        </div>
      )}
    </Page>
  );
}

/** A screen next to this one on the board, opening its editor. */
function referralSibling(
  screen: CustomFormScreen | undefined,
  language: LanguageCode,
): SiblingScreen | null {
  if (screen === undefined) return null;
  return {
    name: textIn(screen.title, language),
    link: { to: '/entities/referral-form/screens/$screenId', params: { screenId: screen.id } },
  };
}
