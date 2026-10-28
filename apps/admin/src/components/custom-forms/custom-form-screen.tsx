/**
 * One screen of a form the team created (RAPP-700), opened from its card:
 * the shared screen editor (`StaffScreenEditor`) with its title, intro and the
 * shared fields section, beside her phone. Its fields, consents and signature
 * blocks are placed with the same picker as Onboarding. Every change is the
 * form's draft (RAPP-701): players see it with the next Publica. Deleting
 * archives the screen, like an Onboarding screen.
 */

import {
  DRAFT_SAVE,
  formBoardNumbers,
  formConditionSources,
  useCreateFormScreen,
} from '@/components/custom-forms/custom-form-page';
import { Page } from '@/components/layout/page';
import { PhoneMiniature } from '@/components/onboarding/phone-preview';
import { useAddDependentScreen } from '@/components/onboarding/screen-board';
import {
  conditionSources,
  FamilyRow,
  ScreenConditionSection,
  type FamilyMember,
} from '@/components/onboarding/screen-condition';
import {
  conditionLine,
  placedPhoneQuestions,
  staffScreenContent,
} from '@/components/onboarding/screen-content';
import {
  DeleteScreenButton,
  ScreenEditorHeading,
  StaffScreenEditor,
  type SiblingScreen,
} from '@/components/onboarding/screen-editor';
import { ScreenFieldsSection } from '@/components/onboarding/screen-fields';
import { teamHideLockKey } from '@/components/onboarding/screen-hiding';
import type { CustomFormData } from '@/lib/custom-forms';
import { supabase } from '@/lib/supabase';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  archiveCustomFormScreen,
  formFamily,
  formRootOf,
  formScreenParent,
  formScreensInOrder,
  saveCustomFormScreen,
  setScreenHidden,
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
  // Her order, each follow-up after the screen asking its question (RAPP-715).
  const ordered = form === undefined ? [] : formScreensInOrder(data.intakeCatalog, form);
  const index = ordered.findIndex((each) => each.id === screenId);
  const screen = index < 0 ? undefined : ordered[index];
  const numbers =
    form === undefined ? new Map<string, string>() : formBoardNumbers(data.intakeCatalog, form);
  const label = screen === undefined ? '' : (numbers.get(screen.id) ?? String(index + 1));
  const roots = ordered.filter(
    (each) => form !== undefined && formRootOf(data.intakeCatalog, form, each.id) === each.id,
  ).length;
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
        siblings={
          form === undefined || screen === undefined
            ? undefined
            : {
                previous: customSibling(form.id, ordered[index - 1], language),
                next: customSibling(form.id, ordered[index + 1], language),
              }
        }
        title={screen === undefined ? t('customForms.notFound') : textIn(screen.title, language)}
        position={
          form === undefined || screen === undefined
            ? undefined
            : t('customForms.screenOf', { number: label, total: roots })
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
          number={Number.parseInt(label, 10) || index + 1}
          total={roots}
          numbers={numbers}
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
  total,
  numbers,
}: {
  readonly data: CustomFormData;
  readonly form: CustomForm;
  readonly screen: CustomFormScreen;
  readonly number: number;
  readonly total: number;
  /** Each screen's number on the board: 3, 3a, 3a.1 (RAPP-715). */
  readonly numbers: ReadonlyMap<string, string>;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const dashboardLanguage = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const catalog = data.intakeCatalog;
  const hideLock = teamHideLockKey(catalog, 'custom_form', screen.id);
  // What it depends on (RAPP-715): a choice question of an earlier screen of this form.
  const ordered = formScreensInOrder(catalog, form);
  const earlier = ordered.slice(
    0,
    Math.max(
      ordered.findIndex((each) => each.id === screen.id),
      0,
    ),
  );
  const sources = conditionSources(
    catalog,
    earlier.map((each) => each.id),
    'custom_form',
    (key) => ({
      name: textIn(ordered.find((each) => each.id === key)?.title ?? {}, dashboardLanguage),
      number: numbers.get(key) ?? '',
      screenKey: key,
    }),
    dashboardLanguage,
  );
  const condition = screen.showWhen ?? null;
  // The family row's + tile (RAPP-717): a screen that depends on this one.
  const createScreen = useCreateFormScreen(form);
  const dependent = useAddDependentScreen({
    catalog,
    sources: formConditionSources(catalog, form, dashboardLanguage),
    onCreate: createScreen,
  });
  const root = formRootOf(catalog, form, screen.id);
  const family = formFamily(catalog, form, root, numbers.get(root) ?? '').flatMap(
    (member): FamilyMember[] => {
      const each = ordered.find((candidate) => candidate.id === member.key);
      if (each === undefined) return [];
      return [
        {
          key: each.id,
          number: member.number,
          name: textIn(each.title, dashboardLanguage),
          line:
            member.depth === 0
              ? ''
              : conditionLine(catalog, each.showWhen ?? null, dashboardLanguage, t),
          depth: member.depth,
          isCurrent: each.id === screen.id,
          picture: (
            <PhoneMiniature
              content={staffScreenContent(
                each.title,
                each.intro,
                placedPhoneQuestions(catalog, each.id, dashboardLanguage, null, 'custom_form'),
                dashboardLanguage,
                t,
              )}
              language={dashboardLanguage}
            />
          ),
          link: {
            to: '/forms/custom/$formId/screens/$screenId',
            params: { formId: form.id, screenId: each.id },
          },
        },
      ];
    },
  );
  return (
    <StaffScreenEditor
      screen={screen}
      number={number}
      total={total}
      family={
        <>
          <FamilyRow members={family} add={dependent.addFor(screen.id)} />
          {dependent.dialog}
        </>
      }
      condition={
        <ScreenConditionSection
          key={JSON.stringify(condition)}
          catalog={catalog}
          screenId={screen.id}
          condition={condition}
          sources={sources}
          isOrphan={condition !== null && formScreenParent(catalog, form, screen) === null}
          line={conditionLine(catalog, condition, dashboardLanguage, t)}
        />
      }
      // A draft: players see it with the next Publica (RAPP-701).
      saveKind={DRAFT_SAVE}
      hide={{
        isHidden: screen.isHidden === true,
        lockReason: hideLock === null ? null : t(hideLock),
        save: (isHidden) => setScreenHidden(supabase, screen.id, isHidden),
      }}
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

/** A screen next to this one on the form's board, opening its editor (RAPP-709). */
function customSibling(
  formId: string,
  screen: CustomFormScreen | undefined,
  language: LanguageCode,
): SiblingScreen | null {
  if (screen === undefined) return null;
  return {
    name: textIn(screen.title, language),
    link: {
      to: '/forms/custom/$formId/screens/$screenId',
      params: { formId, screenId: screen.id },
    },
  };
}
