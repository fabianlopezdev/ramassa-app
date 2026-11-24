/**
 * One screen of a form she sends when she wants (RAPP-939, RAPP-940), opened
 * from its card: the shared screen editor (`StaffScreenEditor`) with its
 * title, intro, help and button, beside the phone, and the questions it asks,
 * added with the question dialog a survey uses (`ScreenFieldsSection`). The
 * suggestions form and the mentoring form share it. The form asks its own
 * questions only, and her answers stay with her request. Every save is what
 * she fills in next.
 *
 * The first screen holds the request's own parts, which the phone draws first
 * and staff cannot remove; it is never deleted. Every screen always shows and
 * depends on no answer.
 */

import { RequireAuth } from '@/components/auth/require-auth';
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
  saveCustomFormScreen,
  textIn,
  type CustomFormScreen,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** One screen's page, behind the same guard as the board. */
export function OnDemandFormScreenPage(props: {
  readonly definition: OnDemandFormDefinition;
  readonly catalog: IntakeCatalog;
  readonly screenId: string;
}) {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={ON_DEMAND_FORM_PERMISSIONS}>
      <OnDemandFormScreenEditor {...props} />
    </RequireAuth>
  );
}

export function OnDemandFormScreenEditor({
  definition,
  catalog,
  screenId,
}: {
  readonly definition: OnDemandFormDefinition;
  readonly catalog: IntakeCatalog;
  readonly screenId: string;
}) {
  const { t, i18n } = useTranslation(['settings', 'nav', definition.namespace]);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const navigate = useNavigate();
  const view = onDemandFormView(catalog, definition.key);
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
  const sibling = (each: CustomFormScreen | undefined): SiblingScreen | null =>
    each === undefined
      ? null
      : {
          name: textIn(each.title, language),
          link: { to: definition.screenPath, params: { screenId: each.id } },
        };
  return (
    <Page data-testid={`${definition.key}-form-screen-page`}>
      <ScreenEditorHeading
        back={{ to: definition.boardPath, label: t(definition.nameKey) }}
        siblings={
          screen === undefined
            ? undefined
            : { previous: sibling(screens[index - 1]), next: sibling(screens[index + 1]) }
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
            ...(isOnDemandFixedScreen(definition, screen)
              ? definition.fixedPhoneQuestions(shown, t)
              : []),
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
            onDeleted={() => navigate({ to: definition.boardPath })}
          />
        </div>
      )}
    </Page>
  );
}
