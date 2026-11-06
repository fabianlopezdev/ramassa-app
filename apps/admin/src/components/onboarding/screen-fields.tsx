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
 *   - "Afegeix un bloc" adds a block (RAPP-690, RAPP-770): a signature (the
 *     text she accepts and a box to sign in, always required), a text, or
 *     points. It moves among the fields and is edited and removed in its own
 *     row.
 *   - Consents of Dades legals (RAPP-699) are picked in the same picker,
 *     placed among the fields, required or not, reworded in their row. The
 *     authorization's consents screen lists consents alone (`consents`).
 *   - A screen of a form the team created (RAPP-700) works like an
 *     Onboarding screen: a field and a consent are asked once per form. A
 *     form the team fills in on her page holds fields only.
 *   - Any field goes on any screen (RAPP-782): one asked on another screen of
 *     the form moves here when it is added, with the fields that depend on it.
 *
 * Type and privacy belong to the field, so this list never asks them.
 */

import { FieldPicker, type FieldPickState } from '@/components/fields/field-picker';
import { AddBlockMenu, FormBlockRow } from '@/components/fields/form-block-row';
import { PlacementRow } from '@/components/fields/placement-row';
import {
  PlacementWordingForm,
  WordingOverrideForm,
  type PlacementWordingDraft,
} from '@/components/fields/placement-wording-form';
import { EditorSection } from '@/components/layout/editor-section';
import { ConsentForm } from '@/components/legal/consent-form';
import { BuiltinForm } from '@/components/onboarding/builtin-question-form';
import { FieldDialog } from '@/components/profile-layout/field-dialog';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { SortableList, type SortableHandle } from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import {
  moveConsequences,
  onboardingPick,
  pickerSectionFor,
  type MoveConsequence,
} from '@/lib/field-picker';
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
  FOLLOW_UP_OWN_FIELDS,
  INTAKE_QUESTION_LABEL_KEYS,
  isFollowUpScreen,
  isRequiredQuestion,
  type IntakeQuestion,
} from '@ramassa/shared/intake';
import {
  authorizationFieldId,
  authorizationForm,
  builtinField,
  builtinRequiredLock,
  canHideBuiltin,
  consentsOn,
  fieldById,
  formBlockName,
  formBlocksOn,
  isAskedGenerically,
  isNameField,
  isStaffWritable,
  overrideFor,
  placementsOnSurface,
  questionsOffTheirControl,
  ramassaScreenIdOf,
  requiredBuiltinQuestions,
  saveBuiltinOverride,
  saveBuiltinQuestionRequired,
  textIn,
  type Consent,
  type CustomFormFiller,
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
import { builtinQuestionType, type TypedBuiltinWording, type TypedWording } from './screen-content';

interface Placed {
  readonly placement: FieldPlacement;
  readonly field: ProfileField;
}

/** The acceptance of the app terms (RAPP-772): always required, never removed. */
const APP_TERMS_CONSENT = 'app_terms';

/** One row of the list: a placed field, a block (RAPP-690, RAPP-770) or a consent (RAPP-699). */
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
 * own control (RAPP-665). On an app follow-up (RAPP-720), its own fields too,
 * which her phone draws with the app's control: they are edited, required and
 * removed like any field.
 */
function placedFields(
  layout: ProfileLayout,
  surface: 'onboarding' | 'custom_form',
  screenKey: string | null,
  offTheirControl: ReadonlySet<IntakeQuestion>,
): readonly Placed[] {
  const own = new Set<string>(
    isFollowUpScreen(screenKey) ? FOLLOW_UP_OWN_FIELDS[screenKey].map((field) => field.key) : [],
  );
  return placementsOnSurface(layout, surface, screenKey).flatMap((placement) => {
    const field = fieldById(layout, placement.fieldId);
    // A form the team created asks every field with the generic renderer (RAPP-700).
    return field === undefined ||
      (surface !== 'custom_form' &&
        !isAskedGenerically(field, offTheirControl, screenKey) &&
        !own.has(field.systemKey ?? ''))
      ? []
      : [{ placement, field }];
  });
}

/**
 * The screens this section edits: an Onboarding screen, or a screen of a
 * form, the app's legal forms included (RAPP-700, RAPP-773).
 */
type FieldsSurface = 'onboarding' | 'custom_form';

/** The form a screen of a form the team created belongs to (RAPP-700). */
export interface ScreenFieldsForm {
  readonly id: string;
  readonly filledBy: CustomFormFiller;
  /** Its live screens in order, to say on which one a field already is. */
  readonly screenIds: readonly string[];
}

export function ScreenFieldsSection({
  surface = 'onboarding',
  form,
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
  /** Onboarding by default. */
  readonly surface?: FieldsSurface;
  /** On a form the team created: the form. */
  readonly form?: ScreenFieldsForm;
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
  readonly onBuiltinLabelChange: (typed: TypedBuiltinWording | undefined) => void;
  readonly onWordingChange: (wording: TypedWording | null) => void;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const uiLanguage = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const layout = profileLayoutOf(catalog);
  const actions = useProfileLayoutActions();
  const [isPicking, setIsPicking] = useState(false);
  const offTheirControl = questionsOffTheirControl(layout);
  const isOnboarding = surface === 'onboarding';
  const isForm = surface === 'custom_form';
  // A form she fills in asks consents and signatures too; a team form, fields only (RAPP-700).
  const isHerForm = isForm && form?.filledBy === 'player';
  const placementKey = screenKey;
  const orderSurface = surface;
  const placed = placedFields(layout, orderSurface, placementKey, offTheirControl);
  const consentSurface = isOnboarding ? 'onboarding' : 'custom_form';
  const asksConsents = isOnboarding || isHerForm;
  const blockSurface = isOnboarding ? 'onboarding' : isHerForm ? 'custom_form' : null;
  const consents = asksConsents ? consentsOn(catalog, consentSurface, placementKey) : [];
  const items = screenItems(
    placed,
    blockSurface === null ? [] : formBlocksOn(catalog.blocks, blockSurface, screenKey),
    consents,
  );
  const { ordered, reorder } = usePlacementOrder(
    orderSurface,
    placementKey,
    items,
    (item) => item.id,
  );
  // The season authorization asks her health: its consent stays, and it keeps
  // one consent at least (RAPP-698, RAPP-773).
  const isAuthorization = form !== undefined && form.id === authorizationForm(catalog)?.id;
  const healthFieldId = authorizationFieldId(catalog, 'health_info');
  const asksHealth =
    isAuthorization &&
    placementsOnSurface(layout, 'custom_form').some(
      (placement) => placement.customFormId === form.id && placement.fieldId === healthFieldId,
    );
  const formConsentCount = isAuthorization
    ? (catalog.consentPlacements ?? []).filter((each) => each.customFormId === form.id).length
    : 0;
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

  // Where a field asked on another screen of this form is now: adding it moves it here (RAPP-782).
  const movesNote = (number: number, screen: string | null): FieldPickState => ({
    kind: 'moves',
    note:
      number > 0
        ? t('fieldPicker.movesFrom', { number })
        : isFollowUpScreen(screen)
          ? t('fieldPicker.movesFromScreen', { screen: t(`builtinScreens.screenName.${screen}`) })
          : t('fieldPicker.movesFromElsewhere'),
  });

  const stateOf = (field: ProfileField): FieldPickState => {
    if (isForm) {
      // A field is asked once per form: one on another of its screens moves here.
      const onThisForm = placementsOnSurface(layout, 'custom_form').find(
        (placement) => placement.fieldId === field.id && placement.customFormId === form?.id,
      );
      if (onThisForm?.screenKey === screenKey) {
        return { kind: 'placed', note: t('fieldPicker.here') };
      }
      if (onThisForm !== undefined) {
        const number = (form?.screenIds ?? []).indexOf(onThisForm.screenKey ?? '') + 1;
        return movesNote(number, onThisForm.screenKey);
      }
      if (!isHerForm && !isStaffWritable(field)) {
        return { kind: 'blocked', note: t('customForms.herFieldOnly') };
      }
      return { kind: 'free' };
    }
    const pick = onboardingPick(layout, field, screenKey);
    if (pick.kind === 'here') return { kind: 'placed', note: t('fieldPicker.here') };
    if (pick.kind === 'free') return { kind: 'free' };
    const stepKey =
      pick.screenKey === null
        ? null
        : ramassaScreenIdOf(pick.screenKey) === null
          ? pick.screenKey
          : customStepKey(pick.screenKey);
    return movesNote(steps.findIndex((step) => step.key === stepKey) + 1, pick.screenKey);
  };

  // A consent is asked once per form (RAPP-699): one on another screen moves here (RAPP-782).
  const consentStateOf = (consent: Consent): FieldPickState => {
    const placement = (catalog.consentPlacements ?? []).find(
      (each) =>
        each.consentId === consent.id &&
        each.surface === consentSurface &&
        (!isForm || each.customFormId === form?.id),
    );
    if (placement === undefined) return { kind: 'free' };
    if (placement.screenKey === placementKey) {
      return { kind: 'placed', note: t('fieldPicker.here') };
    }
    // The acceptance of the app terms stays on its screen (RAPP-772).
    if (consent.key === APP_TERMS_CONSENT) {
      return { kind: 'blocked', note: t('legalData.appTermsAcceptanceLock') };
    }
    if (isForm) {
      const number = (form?.screenIds ?? []).indexOf(placement.screenKey ?? '') + 1;
      return movesNote(number, placement.screenKey);
    }
    const stepKey =
      placement.screenKey === null || ramassaScreenIdOf(placement.screenKey) === null
        ? placement.screenKey
        : customStepKey(placement.screenKey);
    return movesNote(steps.findIndex((step) => step.key === stepKey) + 1, placement.screenKey);
  };

  // Where a screen of this form is, for the move's confirmation (RAPP-782).
  const whereOf = (key: string | null): string => {
    if (isForm) {
      const number = (form?.screenIds ?? []).indexOf(key ?? '') + 1;
      return number > 0
        ? t('fieldPicker.move.whereStep', { number })
        : t('fieldPicker.move.whereElsewhere');
    }
    const stepKey = key === null || ramassaScreenIdOf(key) === null ? key : customStepKey(key);
    const number = steps.findIndex((step) => step.key === stepKey) + 1;
    if (number > 0) return t('fieldPicker.move.whereStep', { number });
    return isFollowUpScreen(key)
      ? t('fieldPicker.move.whereScreen', { screen: t(`builtinScreens.screenName.${key}`) })
      : t('fieldPicker.move.whereElsewhere');
  };
  const fieldName = (id: string) => {
    const field = fieldById(layout, id);
    return field === undefined ? '' : textIn(field.label, uiLanguage);
  };
  const lineOf = (change: MoveConsequence): string => {
    switch (change.kind) {
      case 'field':
        return t('fieldPicker.move.field', {
          field: fieldName(change.fieldId),
          where: whereOf(change.from),
        });
      case 'comesAlong':
        return t('fieldPicker.move.comesAlong', {
          field: fieldName(change.fieldId),
          with: fieldName(change.withId),
          where: whereOf(change.from),
        });
      case 'followUps':
        return t('fieldPicker.move.followUps', {
          field: fieldName(change.fieldId),
          screens: new Intl.ListFormat(uiLanguage, { type: 'conjunction' }).format(
            change.screens.map((screen) => `«${t(`builtinScreens.screenName.${screen}`)}»`),
          ),
        });
      case 'toEveryone':
        return t('fieldPicker.move.toEveryone', {
          field: fieldName(change.fieldId),
          screen: t(`builtinScreens.screenName.${change.from}`),
        });
      case 'dependentScreen':
        return t('fieldPicker.move.dependentScreen', {
          field: fieldName(change.fieldId),
          screen: whereOf(change.screenId),
        });
      case 'consent': {
        const consent = (catalog.consents ?? []).find((each) => each.id === change.consentId);
        return t('fieldPicker.move.field', {
          field: consent === undefined ? '' : textIn(consent.name, uiLanguage),
          where: whereOf(change.from),
        });
      }
      case 'emptied':
        return t('fieldPicker.move.emptied', { where: whereOf(change.screenKey) });
    }
  };
  const formScreens = isForm
    ? ((catalog.customForms ?? []).find((each) => each.id === form?.id)?.screens ?? [])
    : catalog.screens;
  const reviewMove = (fieldIds: readonly string[], consentIds: readonly string[]) => {
    const changes = moveConsequences(
      {
        layout,
        surface: orderSurface,
        ...(form === undefined ? {} : { formId: form.id }),
        screenKey,
        screens: formScreens.flatMap((screen) =>
          screen.showWhen === undefined ? [] : [{ id: screen.id, showWhen: screen.showWhen }],
        ),
        blocks: (catalog.blocks ?? []).filter((block) =>
          isForm
            ? block.surface === 'custom_form' &&
              (form?.screenIds ?? []).includes(block.screenKey ?? '')
            : block.surface === 'onboarding',
        ),
        consents: (catalog.consentPlacements ?? []).filter(
          (each) => each.surface === consentSurface && (!isForm || each.customFormId === form?.id),
        ),
      },
      fieldIds,
      consentIds,
    );
    return changes.length === 0
      ? null
      : { intro: t('fieldPicker.move.intro', { screen: screenName }), lines: changes.map(lineOf) };
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
                : formBlockName(item.block, language)
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
                  !(item.consent.key === 'health_data' && asksHealth) &&
                  !(isAuthorization && formConsentCount === 1) &&
                  // The acceptance of the app terms stays on their form (RAPP-772).
                  item.consent.key !== APP_TERMS_CONSENT
                }
                isEditing={editing === item.consent.placementId}
                onToggleEdit={() => toggle(item.consent.placementId)}
                onClose={close}
                // A form words a consent its own way (RAPP-771).
                isRewordedHere={isForm}
              />
            ) : item.kind === 'block' ? (
              <FormBlockRow
                block={item.block}
                handle={handle}
                language={language}
                isEditing={editing === item.block.id}
                onToggleEdit={() => toggle(item.block.id)}
                onContentChange={(block) =>
                  onWordingChange(
                    block === null ? null : { fieldId: item.block.id, label: {}, help: {}, block },
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
          data-testid="screen-questions-add"
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t('profileLayout.addField')}
        </Button>
        {blockSurface === null ? null : (
          <AddBlockMenu surface={blockSurface} screenKey={screenKey} onAdded={(id) => toggle(id)} />
        )}
      </div>
      <FieldPicker
        layout={layout}
        isOpen={isPicking}
        onOpenChange={setIsPicking}
        title={t('fieldPicker.title', { screen: screenName })}
        initialSectionId={isOnboarding ? pickerSectionFor(layout, screenKey) : null}
        stateOf={stateOf}
        reviewMove={reviewMove}
        onConfirm={(ids) => actions.placeFields(orderSurface, placementKey, ids)}
        onCreateField={(section, draft) => actions.saveField(null, section, draft)}
        {...(asksConsents
          ? {
              consents: {
                items: (catalog.consents ?? []).filter((consent) => !consent.isArchived),
                stateOf: consentStateOf,
                onConfirm: (ids) => actions.placeConsents(consentSurface, placementKey, ids),
              },
            }
          : {})}
      />
    </EditorSection>
  );
}

/**
 * A consent asked on the screen (RAPP-699): required here or not. On
 * Onboarding and the authorization it is reworded for every form; on a form
 * (RAPP-771) the row rewords it for that form only, as a field's row does,
 * and the form's next version freezes that text.
 */
function ConsentPlacementRow({
  consent,
  handle,
  language,
  canRemove,
  isEditing,
  onToggleEdit,
  onClose,
  isRewordedHere,
}: {
  readonly consent: PlacedConsent;
  readonly handle: SortableHandle;
  readonly language: LanguageCode;
  readonly canRemove: boolean;
  readonly isEditing: boolean;
  readonly onToggleEdit: () => void;
  readonly onClose: () => void;
  readonly isRewordedHere: boolean;
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
          // The acceptance of the app terms is what she signs (RAPP-772).
          ...(consent.key === APP_TERMS_CONSENT
            ? { lockReason: t('legalData.appTermsAcceptanceLock') }
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
        {isRewordedHere ? (
          <WordingOverrideForm
            key={consent.placementId}
            texts={[
              {
                name: 'consent-body',
                legend: t('legalData.formWording'),
                value: consent.bodyOverride,
                isLong: true,
                placeholder: (shown) => textIn(consent.ownBody, shown),
              },
            ]}
            onSave={(draft) =>
              actions.saveConsentPlacementWording(
                consent.placementId,
                Object.keys(draft['consent-body']).length === 0 ? null : draft['consent-body'],
              )
            }
            onCancel={onClose}
            testId={`consent-row-${consent.key}-wording`}
          />
        ) : (
          <ConsentForm
            key={consent.id}
            // The consent's own text: Dades legals keeps one for every form.
            consent={{ name: consent.name, body: consent.ownBody }}
            onSave={(draft) => actions.saveConsent({ id: consent.id, ...draft })}
            onCancel={onClose}
            testId={`consent-row-${consent.key}-form`}
          />
        )}
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
  readonly onLabelChange: (typed: TypedBuiltinWording) => void;
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
