/**
 * One onboarding screen's Questions list (RAPP-642, RAPP-651): the fields of
 * the Fitxa placed on this screen, one list, with "Add a field" under it.
 *
 *   - An app screen's own questions come first, in the app's order: reworded
 *     or hidden with their own form, required with the one required list.
 *   - Then the fields staff placed here, by drag: required on this screen,
 *     the wording for her ("Com li ho preguntem") per language, and × to take
 *     the field off the screen. The field stays on the Fitxa.
 *   - "Add a field" opens the picker on the Fitxa; "New field…" in it makes a
 *     field there with the field form and ticks it.
 *
 * Type and privacy belong to the field, so this list never asks them.
 */

import { FieldPicker, type FieldPickState } from '@/components/fields/field-picker';
import { PlacementRow } from '@/components/fields/placement-row';
import {
  PlacementWordingForm,
  type PlacementWordingDraft,
} from '@/components/fields/placement-wording-form';
import { EditorSection } from '@/components/layout/editor-section';
import { BuiltinForm } from '@/components/onboarding/builtin-question-form';
import { FieldDialog } from '@/components/profile-layout/field-dialog';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { SortableList, type SortableHandle } from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import { onboardingPick, pickerSectionFor } from '@/lib/field-picker';
import { profileLayoutOf } from '@/lib/profile-layout';
import { useProfileLayoutActions } from '@/lib/profile-layout-actions';
import { supabase } from '@/lib/supabase';
import { usePlacementOrder } from '@/lib/use-placement-order';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  customStepKey,
  INTAKE_QUESTION_LABEL_KEYS,
  isRequiredQuestion,
  type IntakeQuestion,
} from '@ramassa/shared/intake';
import {
  builtinField,
  builtinRequiredLock,
  canHideBuiltin,
  fieldById,
  overrideFor,
  placementsOnSurface,
  ramassaScreenIdOf,
  requiredBuiltinQuestions,
  saveBuiltinOverride,
  saveBuiltinQuestionRequired,
  textIn,
  type BuilderText,
  type FieldPlacement,
  type IntakeCatalog,
  type ProfileField,
  type ProfileLayout,
  type ProfileSection,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { allSteps } from './board-steps';
import { ConfirmDialog } from './confirm-dialog';
import { builtinQuestionType, type TypedWording } from './screen-content';

interface Placed {
  readonly placement: FieldPlacement;
  readonly field: ProfileField;
}

/** The custom fields placed on a screen, in their order. */
function placedFields(layout: ProfileLayout, screenKey: string): readonly Placed[] {
  return placementsOnSurface(layout, 'onboarding', screenKey).flatMap((placement) => {
    const field = fieldById(layout, placement.fieldId);
    return field === undefined || field.kind !== 'custom' ? [] : [{ placement, field }];
  });
}

export function ScreenFieldsSection({
  catalog,
  screenKey,
  screenName,
  builtinQuestions,
  language,
  editing,
  onEdit,
  onBuiltinLabelChange,
  onWordingChange,
}: {
  readonly catalog: IntakeCatalog;
  /** An app screen's key, or a Ramassà screen's id. */
  readonly screenKey: string;
  readonly screenName: string;
  /** The app screen's own questions; none on a Ramassà screen. */
  readonly builtinQuestions: readonly IntakeQuestion[];
  /** The language the editor writes in. */
  readonly language: LanguageCode;
  /** The row open: a field's id, or a built-in question. */
  readonly editing: string | null;
  readonly onEdit: (id: string | null) => void;
  readonly onBuiltinLabelChange: (label: BuilderText | undefined) => void;
  readonly onWordingChange: (wording: TypedWording | null) => void;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const uiLanguage = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const layout = profileLayoutOf(catalog);
  const actions = useProfileLayoutActions();
  const [isPicking, setIsPicking] = useState(false);
  const placed = placedFields(layout, screenKey);
  const { ordered, reorder } = usePlacementOrder('onboarding', screenKey, placed);
  const sectionOf = (field: ProfileField) =>
    layout.sections.find((section) => section.id === field.sectionId);
  // Sections and the picker are the team's words, in the staff member's language.
  const sectionName = (field: ProfileField) => textIn(sectionOf(field)?.title, uiLanguage);
  const steps = allSteps(catalog);

  const close = () => {
    onEdit(null);
    onBuiltinLabelChange(undefined);
    onWordingChange(null);
  };
  const toggle = (id: string) => {
    close();
    if (editing !== id) onEdit(id);
  };

  const stateOf = (field: ProfileField): FieldPickState => {
    const pick = onboardingPick(layout, field, screenKey);
    if (pick.kind === 'here') return { kind: 'placed', note: t('fieldPicker.here') };
    if (pick.kind === 'free') return { kind: 'free' };
    if (pick.kind === 'withController') {
      const controller = fieldById(layout, pick.controllerId);
      return {
        kind: 'blocked',
        note: t('fieldPicker.withController', {
          field: controller === undefined ? '' : textIn(controller.label, language),
        }),
      };
    }
    const stepKey =
      pick.screenKey === null
        ? null
        : ramassaScreenIdOf(pick.screenKey) === null
          ? pick.screenKey
          : customStepKey(pick.screenKey);
    const number = steps.findIndex((step) => step.key === stepKey) + 1;
    return {
      kind: 'blocked',
      note: number === 0 ? t('fieldPicker.elsewhereApp') : t('fieldPicker.elsewhere', { number }),
    };
  };

  const builtinRows = builtinQuestions.map((question) => (
    <li key={question} className="bg-card">
      <BuiltinPlacementRow
        catalog={catalog}
        question={question}
        field={builtinField(layout, question)}
        sectionName={(field) => sectionName(field)}
        language={language}
        isEditing={editing === question}
        onToggleEdit={() => toggle(question)}
        onClose={close}
        onLabelChange={onBuiltinLabelChange}
      />
    </li>
  ));

  return (
    <EditorSection title={t('tabQuestions')} testId="screen-questions" isFlush>
      {ordered.length === 0 && builtinRows.length === 0 ? (
        <p className="px-5 pt-5 text-start text-sm text-muted-foreground">
          {t('onboardingBoard.noQuestions')}
        </p>
      ) : (
        <SortableList
          items={ordered}
          idOf={(row) => row.placement.id}
          nameOf={(row) => textIn(row.field.label, language)}
          onReorder={(ids) => void reorder(ids)}
          leading={builtinRows}
          className="flex flex-col divide-y"
          itemTestId={(row) => `placement-${row.field.id}`}
          testId="placement-list"
        >
          {(row, handle) => (
            <CustomPlacementRow
              row={row}
              screenKey={screenKey}
              siblings={placed}
              section={sectionOf(row.field)}
              sectionName={sectionName(row.field)}
              handle={handle}
              language={language}
              isEditing={editing === row.field.id}
              onToggleEdit={() => toggle(row.field.id)}
              onClose={close}
              onWordingChange={(draft) =>
                onWordingChange(draft === null ? null : { fieldId: row.field.id, ...draft })
              }
            />
          )}
        </SortableList>
      )}
      <div className="border-t px-5 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsPicking(true)}
          data-testid="screen-questions-add"
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t('profileLayout.addField')}
        </Button>
      </div>
      <FieldPicker
        layout={layout}
        isOpen={isPicking}
        onOpenChange={setIsPicking}
        title={t('fieldPicker.title', { screen: screenName })}
        initialSectionId={pickerSectionFor(layout, screenKey)}
        stateOf={stateOf}
        onConfirm={(ids) => actions.placeFields('onboarding', screenKey, ids)}
        onCreateField={(section, draft) => actions.saveField(null, section, draft)}
      />
    </EditorSection>
  );
}

function CustomPlacementRow({
  row,
  screenKey,
  siblings,
  section,
  sectionName,
  handle,
  language,
  isEditing,
  onToggleEdit,
  onClose,
  onWordingChange,
}: {
  readonly row: Placed;
  readonly screenKey: string;
  /** The fields on the same screen, for the conditions that depend on this one. */
  readonly siblings: readonly Placed[];
  /** The field's section on the Fitxa. */
  readonly section: ProfileSection | undefined;
  readonly sectionName: string;
  readonly handle: SortableHandle;
  readonly language: LanguageCode;
  readonly isEditing: boolean;
  readonly onToggleEdit: () => void;
  readonly onClose: () => void;
  readonly onWordingChange: (draft: PlacementWordingDraft | null) => void;
}) {
  const { t } = useTranslation('settings');
  const actions = useProfileLayoutActions();
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isEditingField, setIsEditingField] = useState(false);
  const { placement, field } = row;
  const name = textIn(field.label, language);

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    try {
      await action();
    } catch {
      toast.error(t('questions.failed'));
    } finally {
      setIsBusy(false);
    }
  }

  function askRemove() {
    // A condition stays with the field it depends on (the database says so too).
    const dependent = siblings.find((each) => each.field.showWhen?.fieldId === field.id);
    if (dependent !== undefined) {
      toast.error(
        t('placement.removeConditionFirst', { field: textIn(dependent.field.label, language) }),
      );
      return;
    }
    setIsConfirming(true);
  }

  return (
    <>
      <PlacementRow
        name={name}
        detail={t('placement.fromRamassa', { section: sectionName })}
        type={field.type}
        privacy={field.privacy}
        handle={handle}
        required={{
          id: `required-${field.id}`,
          checked: placement.required,
          onChange: (next) =>
            void run(() =>
              actions.savePlacement(placement.id, {
                required: next,
                labelOverride: placement.labelOverride,
                helpOverride: placement.helpOverride,
              }),
            ),
        }}
        isBusy={isBusy}
        isEditing={isEditing}
        onToggleEdit={onToggleEdit}
        onRemove={askRemove}
        testId={`placement-row-${field.id}`}
      >
        <PlacementWordingForm
          key={`${screenKey}-${placement.id}`}
          placement={placement}
          field={field}
          legend={t('placement.askHer')}
          onChange={onWordingChange}
          onSave={(draft) =>
            actions.savePlacement(placement.id, {
              required: placement.required,
              labelOverride: draft.label,
              helpOverride: draft.help,
            })
          }
          onCancel={onClose}
          secondaryAction={
            section === undefined ? undefined : (
              <Button
                type="button"
                variant="ghost"
                className="-ms-2.5"
                onClick={() => setIsEditingField(true)}
                data-testid={`placement-row-${field.id}-field`}
              >
                {t('profileLayout.editField')}
              </Button>
            )
          }
        />
      </PlacementRow>
      <ConfirmDialog
        isOpen={isConfirming}
        onOpenChange={setIsConfirming}
        title={t('placement.removeTitle', { field: name })}
        description={t('placement.removeBody')}
        action={t('placement.remove')}
        onConfirm={() => void run(() => actions.removePlacement(placement.id))}
      />
      {section === undefined ? null : (
        <FieldDialog
          section={section}
          field={field}
          isOpen={isEditingField}
          onOpenChange={setIsEditingField}
          onSave={(draft) => actions.saveField(field, section, draft)}
        />
      )}
    </>
  );
}

function BuiltinPlacementRow({
  catalog,
  question,
  field,
  sectionName,
  language,
  isEditing,
  onToggleEdit,
  onClose,
  onLabelChange,
}: {
  readonly catalog: IntakeCatalog;
  readonly question: IntakeQuestion;
  /** Its field on the Fitxa; absent while the catalog has no layout. */
  readonly field: ProfileField | undefined;
  readonly sectionName: (field: ProfileField) => string;
  readonly language: LanguageCode;
  readonly isEditing: boolean;
  readonly onToggleEdit: () => void;
  readonly onClose: () => void;
  readonly onLabelChange: (label: BuilderText) => void;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const reload = useReload();
  const [isBusy, setIsBusy] = useState(false);
  const required = requiredBuiltinQuestions(catalog);
  const override = overrideFor(catalog, question);
  const appLabel = t(INTAKE_QUESTION_LABEL_KEYS[question] ?? question);
  const reworded = override?.label == null ? '' : textIn(override.label, language);
  const isHidden = override?.isHidden === true && canHideBuiltin(question, required);
  const detail = [
    field === undefined
      ? t('settings:placement.fromAppAlone')
      : t('settings:placement.fromApp', { section: sectionName(field) }),
    isHidden ? t('settings:questions.hidden') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <PlacementRow
      name={reworded || appLabel}
      detail={detail}
      type={field?.type ?? builtinQuestionType(question)}
      privacy={field?.privacy ?? 'personal'}
      handle={null}
      required={{
        id: `builtin-required-${question}`,
        checked: isRequiredQuestion(question, required),
        ...(builtinRequiredLock(question) === undefined
          ? {}
          : { lockReason: t('settings:questions.requiredLock.always') }),
        onChange: (next) => {
          setIsBusy(true);
          saveBuiltinQuestionRequired(supabase, question, next)
            .then(() => reload())
            .catch(() => toast.error(t('settings:questions.failed')))
            .finally(() => setIsBusy(false));
        },
      }}
      isBusy={isBusy}
      isEditing={isEditing}
      onToggleEdit={onToggleEdit}
      testId={`builtin-row-${question}`}
    >
      <BuiltinForm
        info={{ question, label: appLabel }}
        override={override}
        required={required}
        onLabelChange={onLabelChange}
        onSave={async (next) => {
          await saveBuiltinOverride(supabase, next);
          await reload();
        }}
        onCancel={onClose}
      />
    </PlacementRow>
  );
}
