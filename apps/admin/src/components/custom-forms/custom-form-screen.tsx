/**
 * One screen of a form the team created (RAPP-700), opened from its card:
 * the shared screen editor (`StaffScreenEditor`) with its title, intro and the
 * shared fields section, beside her phone. Its fields, consents and signature
 * blocks are placed with the same picker as Onboarding. Every change is the
 * form's draft (RAPP-701): players see it with the next Publica. Deleting
 * archives the screen, like an Onboarding screen.
 */

import { DRAFT_SAVE } from '@/components/custom-forms/custom-form-page';
import { Page } from '@/components/layout/page';
import { placedPhoneQuestions } from '@/components/onboarding/screen-content';
import {
  DeleteScreenButton,
  ScreenEditorHeading,
  StaffScreenEditor,
} from '@/components/onboarding/screen-editor';
import { ScreenFieldsSection } from '@/components/onboarding/screen-fields';
import type { CustomFormData } from '@/lib/custom-forms';
import { supabase } from '@/lib/supabase';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  archiveCustomFormScreen,
  saveCustomFormScreen,
  textIn,
  type CustomForm,
  type CustomFormScreen,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function CustomFormScreenEditor({
  data,
  formId,
  screenId,
}: {
  readonly data: CustomFormData;
  readonly formId: string;
  readonly screenId: string;
}) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const form = (data.intakeCatalog.customForms ?? []).find((each) => each.id === formId);
  const index = form === undefined ? -1 : form.screens.findIndex((each) => each.id === screenId);
  const screen = form === undefined || index < 0 ? undefined : form.screens[index];
  return (
    <Page data-testid="custom-form-screen-page">
      <ScreenEditorHeading
        back={
          form === undefined
            ? { to: '/forms/custom', label: t('customForms.title') }
            : {
                to: '/forms/custom/$formId',
                params: { formId: form.id },
                label: textIn(form.name, language),
              }
        }
        title={screen === undefined ? t('customForms.notFound') : textIn(screen.title, language)}
        position={
          form === undefined || screen === undefined
            ? undefined
            : t('customForms.screenOf', { number: index + 1, total: form.screens.length })
        }
        actions={
          form === undefined || screen === undefined ? undefined : (
            <DeleteFormScreen form={form} screen={screen} name={textIn(screen.title, language)} />
          )
        }
      />
      {form === undefined || screen === undefined ? null : (
        // Keyed by the screen: another screen starts from what is saved.
        <FormScreenBody
          key={screen.id}
          data={data}
          form={form}
          screen={screen}
          number={index + 1}
        />
      )}
    </Page>
  );
}

function FormScreenBody({
  data,
  form,
  screen,
  number,
}: {
  readonly data: CustomFormData;
  readonly form: CustomForm;
  readonly screen: CustomFormScreen;
  readonly number: number;
}) {
  const catalog = data.intakeCatalog;
  return (
    <StaffScreenEditor
      screen={screen}
      number={number}
      total={form.screens.length}
      // A draft: players see it with the next Publica (RAPP-701).
      saveKind={DRAFT_SAVE}
      phoneQuestions={(language, wording) =>
        placedPhoneQuestions(catalog, screen.id, language, wording, 'custom_form')
      }
      onStore={(title, intro) =>
        saveCustomFormScreen(supabase, { id: screen.id, formId: form.id, title, intro })
      }
      fields={(row, language, name) => (
        <ScreenFieldsSection
          surface="custom_form"
          form={{
            id: form.id,
            filledBy: form.filledBy,
            screenIds: form.screens.map((each) => each.id),
          }}
          catalog={catalog}
          screenKey={screen.id}
          screenName={name}
          builtinQuestions={[]}
          language={language}
          editing={row.editing}
          onEdit={row.setEditing}
          onBuiltinLabelChange={row.setBuiltinLabel}
          onWordingChange={row.setWording}
        />
      )}
    />
  );
}

function DeleteFormScreen({
  form,
  screen,
  name,
}: {
  readonly form: CustomForm;
  readonly screen: CustomFormScreen;
  readonly name: string;
}) {
  const navigate = useNavigate();
  return (
    <DeleteScreenButton
      name={name}
      onDelete={async () => {
        // Archived: the fields leave the screen and stay in Dades with her answers.
        await archiveCustomFormScreen(supabase, screen.id);
        await navigate({ to: '/forms/custom/$formId', params: { formId: form.id } });
      }}
    />
  );
}
