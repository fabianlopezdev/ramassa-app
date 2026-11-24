/**
 * One screen of the suggestions form (RAPP-939), opened from its card: the
 * shared screen editor (`StaffScreenEditor`) with its title, intro, help and
 * button, beside the phone, and the questions it asks, added with the
 * question dialog a survey uses (`ScreenFieldsSection`). The form asks its own
 * questions only, and her answers stay with her suggestion. Every save is
 * what she fills in next.
 *
 * The first screen holds the suggestion's own parts (the type, the text and
 * the photo), which the phone draws first and staff cannot remove; it is
 * never deleted. Every screen always shows and depends on no answer.
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
import { ScreenFieldsSection } from '@/components/onboarding/screen-fields';
import {
  feedbackFixedPhoneQuestions,
  feedbackFormView,
  isFeedbackMessageScreen,
} from '@/lib/feedback-form';
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

export function FeedbackFormScreenEditor({
  catalog,
  screenId,
}: {
  readonly catalog: IntakeCatalog;
  readonly screenId: string;
}) {
  const { t, i18n } = useTranslation(['settings', 'nav', 'feedback']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const navigate = useNavigate();
  const view = feedbackFormView(catalog);
  const screens = view?.form.screens ?? [];
  const index = screens.findIndex((each) => each.id === screenId);
  const screen = index < 0 ? undefined : screens[index];
  // The fixed screen is never deleted: `customFormDeletion` offers nothing for it.
  const deletion =
    view === null || screen === undefined
      ? undefined
      : customFormDeletion(
          view.catalog,
          view.form,
          screen.id,
          language,
          formBoardNumbers(view.catalog, view.form),
        );
  return (
    <Page data-testid="feedback-form-screen-page">
      <ScreenEditorHeading
        back={{ to: '/forms/feedback', label: t('nav:staff.feedbackForm') }}
        siblings={
          screen === undefined
            ? undefined
            : {
                previous: feedbackSibling(screens[index - 1], language),
                next: feedbackSibling(screens[index + 1], language),
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
          phoneQuestions={(shown, wording) => [
            ...(isFeedbackMessageScreen(screen) ? feedbackFixedPhoneQuestions(shown, t) : []),
            ...placedPhoneQuestions(view.catalog, screen.id, shown, wording, 'custom_form'),
          ]}
          onStore={(title, intro, texts) =>
            saveCustomFormScreen(supabase, {
              id: screen.id,
              formId: view.form.id,
              title,
              intro,
              texts,
            })
          }
          fields={(row, editorLanguage, name) => (
            <ScreenFieldsSection
              surface="custom_form"
              form={{
                id: view.form.id,
                filledBy: view.form.filledBy,
                // Its own questions only, as a survey asks (RAPP-929).
                isSurvey: true,
                screenIds: screens.map((each) => each.id),
              }}
              catalog={view.catalog}
              screenKey={screen.id}
              screenName={name}
              builtinQuestions={[]}
              language={editorLanguage}
              editing={row.editing}
              onEdit={row.setEditing}
              onBuiltinLabelChange={row.setBuiltinLabel}
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
            onDeleted={() => navigate({ to: '/forms/feedback' })}
          />
        </div>
      )}
    </Page>
  );
}

/** A screen next to this one on the board, opening its editor. */
function feedbackSibling(
  screen: CustomFormScreen | undefined,
  language: LanguageCode,
): SiblingScreen | null {
  if (screen === undefined) return null;
  return {
    name: textIn(screen.title, language),
    link: { to: '/forms/feedback/screens/$screenId', params: { screenId: screen.id } },
  };
}
