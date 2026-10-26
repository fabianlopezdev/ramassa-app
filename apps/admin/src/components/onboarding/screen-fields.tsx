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
 *   - "Add a signature" adds a signature block (RAPP-690): the text she
 *     accepts and a box to sign in. It moves among the fields, always
 *     required, and is edited and removed in its own row.
 *   - Consents of Dades legals (RAPP-699) are picked in the same picker,
 *     placed among the fields, required or not, reworded in their row. The
 *     authorization's consents screen lists consents alone (`consents`).
 *
 * Type and privacy belong to the field, so this list never asks them.
 */

import { FieldPicker, type FieldPickState } from '@/components/fields/field-picker';
import { PlacementRow } from '@/components/fields/placement-row';
import {
  PlacementWordingForm,
  type PlacementWordingDraft,
} from '@/components/fields/placement-wording-form';
import { AddSignatureButton, SignatureBlockRow } from '@/components/fields/signature-block-row';
import { EditorSection } from '@/components/layout/editor-section';
import { ConsentForm } from '@/components/legal/consent-form';
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
  authorizationFieldId,
  builtinField,
  builtinRequiredLock,
  canHideBuiltin,
  consentsOn,
  fieldById,
  formBlocksOn,
  formBlockText,
  isAskedGenerically,
  isNameField,
  overrideFor,
  placementsOnSurface,
  questionsOffTheirControl,
  ramassaScreenIdOf,
  requiredBuiltinQuestions,
  saveBuiltinOverride,
  saveBuiltinQuestionRequired,
  textIn,
  type BuilderText,
  type Consent,
  type FieldPlacement,
  type FormBlock,
  type IntakeCatalog,
  type PlacedConsent,
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

/** One row of the list: a placed field, a signature block (RAPP-690) or a consent (RAPP-699). */
type ScreenItem =
  | { readonly kind: 'field'; readonly id: string; readonly placed: Placed }
  | { readonly kind: 'block'; readonly id: string; readonly block: FormBlock }
  | { readonly kind: 'consent'; readonly id: string; readonly consent: PlacedConsent };

/** The fields, blocks and consents of a screen in the order they share, a field first on a tie. */
function screenItems(
  placed: readonly Placed[],
  blocks: readonly FormBlock[],
  consents: readonly PlacedConsent[],
): ScreenItem[] {
  const items = [
    ...placed.map((row) => ({
      item: { kind: 'field', id: row.placement.id, placed: row } as ScreenItem,
      order: row.placement.sortOrder,
      rank: 0,
    })),
    ...blocks.map((block) => ({
      item: { kind: 'block', id: block.id, block } as ScreenItem,
      order: block.sortOrder,
      rank: 1,
    })),
    ...consents.map((consent) => ({
      item: { kind: 'consent', id: consent.placementId, consent } as ScreenItem,
      order: consent.sortOrder,
      rank: 2,
    })),
  ];
  return items.sort((a, b) => a.order - b.order || a.rank - b.rank).map((entry) => entry.item);
}

/**
 * The fields placed on a screen that her phone asks with the generic
 * renderer, in their order: the Ramassà fields, and the app fields off their
 * own control (RAPP-665).
 */
function placedFields(
  layout: ProfileLayout,
  surface: 'onboarding' | 'authorization',
  screenKey: string | null,
  offTheirControl: ReadonlySet<IntakeQuestion>,
): readonly Placed[] {
  return placementsOnSurface(layout, surface, screenKey).flatMap((placement) => {
    const field = fieldById(layout, placement.fieldId);
    return field === undefined || !isAskedGenerically(field, offTheirControl)
      ? []
      : [{ placement, field }];
  });
}

/**
 * The screens this section edits: an Onboarding screen, the authorization's
 * Health screen (RAPP-698), or its consents screen (`consents`, RAPP-699).
 */
type FieldsSurface = 'onboarding' | 'authorization' | 'consents';

export function ScreenFieldsSection({
  surface = 'onboarding',
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
  /** Onboarding by default; the authorization's Health screen is its surface's one screen. */
  readonly surface?: FieldsSurface;
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
  const offTheirControl = questionsOffTheirControl(layout);
  const isOnboarding = surface === 'onboarding';
  const isConsents = surface === 'consents';
  // The Health and consents screens are their surface's one screen: their placements name none.
  const placementKey = isOnboarding ? screenKey : null;
  // The consents screen is the authorization's surface for consents (RAPP-699).
  const orderSurface = surface === 'consents' ? 'authorization' : surface;
  const placed = isConsents
    ? []
    : placedFields(layout, orderSurface, placementKey, offTheirControl);
  const consentSurface = isOnboarding ? 'onboarding' : 'authorization';
  const consents =
    isOnboarding || isConsents ? consentsOn(catalog, consentSurface, placementKey) : [];
  const items = screenItems(
    placed,
    isOnboarding ? formBlocksOn(catalog.blocks, 'onboarding', screenKey) : [],
    consents,
  );
  const { ordered, reorder } = usePlacementOrder(
    orderSurface,
    placementKey,
    items,
    (item) => item.id,
  );
  // The authorization asks her health: its consent stays (RAPP-698).
  const healthFieldId = authorizationFieldId(catalog, 'health_info');
  const asksHealth = placementsOnSurface(layout, 'authorization').some(
    (placement) => placement.fieldId === healthFieldId,
  );
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
    if (!isOnboarding) {
      // A field is asked once per surface: here, or free to place.
      return placementsOnSurface(layout, orderSurface).some(
        (placement) => placement.fieldId === field.id,
      )
        ? { kind: 'placed', note: t('fieldPicker.here') }
        : { kind: 'free' };
    }
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

  // A consent is asked once per form: here, on another Onboarding screen, or free (RAPP-699).
  const consentStateOf = (consent: Consent): FieldPickState => {
    const placement = (catalog.consentPlacements ?? []).find(
      (each) => each.consentId === consent.id && each.surface === consentSurface,
    );
    if (placement === undefined) return { kind: 'free' };
    if (placement.screenKey === placementKey)
      return { kind: 'placed', note: t('fieldPicker.here') };
    const stepKey =
      placement.screenKey === null || ramassaScreenIdOf(placement.screenKey) === null
        ? placement.screenKey
        : customStepKey(placement.screenKey);
    const number = steps.findIndex((step) => step.key === stepKey) + 1;
    return {
      kind: 'blocked',
      note: number === 0 ? t('fieldPicker.elsewhereApp') : t('fieldPicker.elsewhere', { number }),
    };
  };

  // A question off its own control is asked by its fields' rows instead (RAPP-665).
  const builtinRows = builtinQuestions
    .filter((question) => !offTheirControl.has(question))
    .map((question) => (
      <li key={question} className="bg-card">
        <BuiltinPlacementRow
          catalog={catalog}
          question={question}
          field={builtinField(layout, question)}
          sectionName={(field) => sectionName(field)}
          language={language}
          screenKey={screenKey}
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
          idOf={(item) => item.id}
          nameOf={(item) =>
            item.kind === 'field'
              ? textIn(item.placed.field.label, language)
              : item.kind === 'consent'
                ? textIn(item.consent.name, language)
                : formBlockText(item.block, language).text
          }
          onReorder={(ids) => void reorder(ids)}
          leading={builtinRows}
          className="flex flex-col divide-y"
          itemTestId={(item) =>
            item.kind === 'field'
              ? `placement-${item.placed.field.id}`
              : item.kind === 'consent'
                ? `consent-${item.consent.key}`
                : `block-${item.block.id}`
          }
          testId="placement-list"
        >
          {(item, handle) =>
            item.kind === 'consent' ? (
              <ConsentPlacementRow
                consent={item.consent}
                handle={handle}
                language={language}
                canRemove={
                  !(isConsents && item.consent.key === 'health_data' && asksHealth) &&
                  !(isConsents && consents.length === 1)
                }
                isEditing={editing === item.consent.placementId}
                onToggleEdit={() => toggle(item.consent.placementId)}
                onClose={close}
              />
            ) : item.kind === 'block' ? (
              <SignatureBlockRow
                block={item.block}
                handle={handle}
                language={language}
                isEditing={editing === item.block.id}
                onToggleEdit={() => toggle(item.block.id)}
                onTextChange={(body) =>
                  onWordingChange(
                    body === null ? null : { fieldId: item.block.id, label: body, help: {} },
                  )
                }
              />
            ) : (
              <CustomPlacementRow
                row={item.placed}
                screenKey={screenKey}
                siblings={placed}
                section={sectionOf(item.placed.field)}
                sectionName={sectionName(item.placed.field)}
                handle={handle}
                language={language}
                isEditing={editing === item.placed.field.id}
                onToggleEdit={() => toggle(item.placed.field.id)}
                onClose={close}
                onWordingChange={(draft) =>
                  onWordingChange(
                    draft === null ? null : { fieldId: item.placed.field.id, ...draft },
                  )
                }
              />
            )
          }
        </SortableList>
      )}
      <div className="flex flex-wrap gap-2 border-t px-5 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsPicking(true)}
          data-testid={isConsents ? 'screen-consents-add' : 'screen-questions-add'}
        >
          <Plus aria-hidden data-icon="inline-start" />
          {isConsents ? t('legalData.addConsent') : t('profileLayout.addField')}
        </Button>
        {isOnboarding ? (
          <AddSignatureButton
            surface="onboarding"
            screenKey={screenKey}
            onAdded={(id) => toggle(id)}
          />
        ) : null}
      </div>
      <FieldPicker
        layout={layout}
        isOpen={isPicking}
        onOpenChange={setIsPicking}
        title={t('fieldPicker.title', { screen: screenName })}
        initialSectionId={
          isOnboarding
            ? pickerSectionFor(layout, screenKey)
            : (layout.sections.find((section) => section.key === 'health_needs')?.id ?? null)
        }
        stateOf={stateOf}
        onConfirm={(ids) => actions.placeFields(orderSurface, placementKey, ids)}
        onCreateField={(section, draft) => actions.saveField(null, section, draft)}
        {...(isOnboarding || isConsents
          ? {
              consents: {
                items: (catalog.consents ?? []).filter((consent) => !consent.isArchived),
                stateOf: consentStateOf,
                onConfirm: (ids) => actions.placeConsents(consentSurface, placementKey, ids),
                isOnly: isConsents,
              },
            }
          : {})}
      />
    </EditorSection>
  );
}

/** A consent asked on the screen (RAPP-699): required here or not, reworded for every form. */
function ConsentPlacementRow({
  consent,
  handle,
  language,
  canRemove,
  isEditing,
  onToggleEdit,
  onClose,
}: {
  readonly consent: PlacedConsent;
  readonly handle: SortableHandle;
  readonly language: LanguageCode;
  readonly canRemove: boolean;
  readonly isEditing: boolean;
  readonly onToggleEdit: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('settings');
  const actions = useProfileLayoutActions();
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const name = textIn(consent.name, language);

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

  return (
    <>
      <PlacementRow
        name={name}
        detail={textIn(consent.body, language)}
        type="consent"
        privacy={null}
        handle={handle}
        required={{
          id: `consent-required-${consent.key}`,
          checked: consent.required,
          // Image rights drive the photo consent, which she can always refuse.
          ...(consent.key === 'image_rights'
            ? { lockReason: t('authorizationEditor.imageRightsLock') }
            : {}),
          onChange: (next) =>
            void run(() => actions.saveConsentPlacement(consent.placementId, next)),
        }}
        isBusy={isBusy}
        isEditing={isEditing}
        onToggleEdit={onToggleEdit}
        {...(canRemove ? { onRemove: () => setIsConfirming(true) } : {})}
        testId={`consent-row-${consent.key}`}
      >
        <ConsentForm
          key={consent.id}
          consent={consent}
          onSave={(draft) => actions.saveConsent({ id: consent.id, ...draft })}
          onCancel={onClose}
          testId={`consent-row-${consent.key}-form`}
        />
      </PlacementRow>
      <ConfirmDialog
        isOpen={isConfirming}
        onOpenChange={setIsConfirming}
        title={t('placement.removeTitle', { field: name })}
        description={t('legalData.removeBody')}
        action={t('placement.remove')}
        onConfirm={() => void run(() => actions.removeConsentPlacement(consent.placementId))}
      />
    </>
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
        detail={sectionName}
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
  screenKey,
  language,
  isEditing,
  onToggleEdit,
  onClose,
  onLabelChange,
}: {
  readonly catalog: IntakeCatalog;
  readonly question: IntakeQuestion;
  readonly screenKey: string;
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
  const actions = useProfileLayoutActions();
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const required = requiredBuiltinQuestions(catalog);
  // Every app field but her names leaves its screen like any field (RAPP-665).
  const placement =
    field === undefined || isNameField(field)
      ? undefined
      : placementsOnSurface(profileLayoutOf(catalog), 'onboarding', screenKey).find(
          (candidate) => candidate.fieldId === field.id,
        );
  const override = overrideFor(catalog, question);
  const appLabel = t(INTAKE_QUESTION_LABEL_KEYS[question] ?? question);
  const reworded = override?.label == null ? '' : textIn(override.label, language);
  const isHidden = override?.isHidden === true && canHideBuiltin(question, required);
  const detail = [
    field === undefined ? null : sectionName(field),
    isHidden ? t('settings:questions.hidden') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
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
        {...(placement === undefined ? {} : { onRemove: () => setIsConfirming(true) })}
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
      {/* Outside the row: the row draws its children only while it is open for editing. */}
      {placement === undefined ? null : (
        <ConfirmDialog
          isOpen={isConfirming}
          onOpenChange={setIsConfirming}
          title={t('settings:placement.removeTitle', { field: reworded || appLabel })}
          description={t('settings:placement.removeBody')}
          action={t('settings:placement.remove')}
          onConfirm={() => {
            setIsBusy(true);
            actions
              .removePlacement(placement.id)
              .catch(() => toast.error(t('settings:questions.failed')))
              .finally(() => setIsBusy(false));
          }}
        />
      )}
    </>
  );
}
