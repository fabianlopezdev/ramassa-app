/**
 * One onboarding screen's editor (RAPP-641), opened from its card on the
 * registration board. The form sits on the start side and her phone on the
 * end side, drawn from what staff type before they save.
 *
 *   - A Ramassà screen: its title and intro, and the fields of the Fitxa
 *     placed on it (RAPP-651). It is deleted (archived) here.
 *   - An app screen: its wording per language and its hide switch (RAPP-612),
 *     its own questions reworded, hidden or made required, then the fields
 *     placed on it. A screen with a detail screen edits that one's wording
 *     too. The document screen's explanation is its help (RAPP-721).
 *   - The app terms and the season authorization are forms of their own
 *     (RAPP-696): their screens open on their boards, and the terms screens'
 *     buttons (`WordingSection`) are edited there.
 *
 * Fields are picked from the Fitxa (`ScreenFieldsSection`): their type and
 * privacy are the Fitxa's, so this editor never asks them. The form writes in
 * one language at a time; the phone has its own language switch, Arabic and
 * Farsi right to left.
 */

import { EditorColumns } from '@/components/layout/editor-columns';
import { EditorSection } from '@/components/layout/editor-section';
import { Page, PageHeader } from '@/components/layout/page';
import { useTranslatableTexts } from '@/components/layout/translate-from-catalan';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { OnboardingDesignData } from '@/lib/onboarding-design';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getLanguageDirection, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import {
  followedTeamText,
  staffTextIn,
  staffTextToSave,
} from '@ramassa/shared/i18n/localized-content';
import {
  customStepKey,
  DETAIL_SCREEN_PARENTS,
  isOptionalScreenTextField,
  screenTextFields,
  SEASON_WIZARD_SCREENS,
  WIZARD_QUESTION_SCREENS,
  WIZARD_SCREEN_QUESTIONS,
  type EditableWizardScreen,
  type ScreenTextField,
  type WizardQuestionScreen,
} from '@ramassa/shared/intake';
import {
  canHideBuiltin,
  detailBranch,
  isDetailScreen,
  movableOrder,
  onboardingConditionOf,
  onboardingFamily,
  onboardingParentOf,
  onboardingRootOf,
  requiredBuiltinQuestions,
  saveBuiltinScreen,
  saveIntakeScreen,
  screenSettingsFor,
  setScreenHidden,
  textIn,
  type BuilderText,
  type IntakeCatalog,
  type RamassaScreen,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import {
  allSteps,
  boardNumbers,
  boardRootCount,
  boardStep,
  editableScreenOf,
  routeIdOf,
  stepFromRouteId,
  type BoardStep,
} from './board-steps';
import { PhoneFrame, PhoneMiniature } from './phone-preview';
import {
  onboardingConditionSources,
  onboardingStepName,
  stepName,
  useAddDependentScreen,
  useCreateOnboardingScreen,
  type BoardCardLink,
} from './screen-board';
import {
  AddDependentButton,
  conditionSources,
  FamilyRow,
  ScreenConditionSection,
  type FamilyMember,
} from './screen-condition';
import {
  builtinPhoneQuestion,
  bundledScreenText,
  conditionLine,
  detailScreenContent,
  placedPhoneQuestions,
  staffScreenContent,
  stepContent,
  type PhoneQuestion,
  type ScreenTexts,
  type Translate,
  type TypedWording,
} from './screen-content';
import { DeleteScreenAction, onboardingDeletion } from './screen-deletion';
import { ScreenFieldsSection } from './screen-fields';
import { builtinHideLockKey, teamHideLockKey } from './screen-hiding';

/** The control column of a setting row, as on the account page: one width, natural controls. */
const CONTROL_COLUMN = 'flex w-full flex-col gap-2 @md/field-group:w-100!';

export function ScreenEditor({
  data,
  routeId,
  shown = 'main',
}: {
  readonly data: OnboardingDesignData;
  readonly routeId: string;
  /** The app follow-up to edit (RAPP-713, RAPP-715): its branch card and the family row open it. */
  readonly shown?: string;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const catalog = data.intakeCatalog;
  const step = stepFromRouteId(catalog, routeId);
  const steps = allSteps(catalog);
  const index = step === null ? -1 : steps.findIndex((each) => each.key === step.key);
  // Its number on the board: "3", or "3a" for a follow-up (RAPP-715).
  const label = step === null ? '' : (boardNumbers(catalog).get(step.key) ?? String(index + 1));
  const number = Number.parseInt(label, 10) || 0;
  const total = boardRootCount(catalog);
  const navigate = useNavigate();
  const current =
    isDetailScreen(shown) && detailBranch(shown).parent === step?.key ? shown : step?.key;
  const deletion =
    current === undefined ? undefined : onboardingDeletion(catalog, current, language, t);

  return (
    <Page data-testid="screen-editor-page">
      <ScreenEditorHeading
        back={{ to: '/onboarding', label: t('onboardingPage.title') }}
        siblings={
          step === null
            ? undefined
            : {
                previous: onboardingSibling(steps[index - 1], language, t),
                next: onboardingSibling(steps[index + 1], language, t),
              }
        }
        title={step === null ? t('onboardingBoard.notFound') : stepName(step, language, t)}
        position={step === null ? undefined : t('onboardingBoard.stepOf', { number: label, total })}
      />
      {step === null ? null : (
        // Keyed by the screen: another screen starts from what is saved.
        <EditorBody
          key={step.key}
          data={data}
          step={step}
          number={number}
          total={total}
          shown={shown}
        />
      )}
      {deletion === undefined ? null : (
        <div className="flex justify-end">
          <DeleteScreenAction
            key={deletion.key}
            deletion={deletion}
            variant="button"
            onDeleted={() => navigate({ to: '/onboarding' })}
          />
        </div>
      )}
    </Page>
  );
}

/** An Onboarding screen next to this one, opening its editor (RAPP-709). */
function onboardingSibling(
  step: BoardStep | undefined,
  language: LanguageCode,
  t: Translate,
): SiblingScreen | null {
  if (step === undefined) return null;
  return {
    name: stepName(step, language, t),
    link: { to: '/onboarding/screens/$screenId', params: { screenId: routeIdOf(step.key) } },
  };
}

/**
 * Every form's screen editor heading (RAPP-641, shared by every form since
 * RAPP-696): back to its board, the screen's name and its place on it.
 */
/** A screen next to this one on its board, and where its editor opens (RAPP-709). */
export interface SiblingScreen {
  readonly name: string;
  readonly link: BoardCardLink;
}

/** Previous or next screen: its editor opens; at either end of the board it is off. */
function SiblingButton({
  screen,
  label,
  direction,
}: {
  readonly screen: SiblingScreen | null;
  readonly label: string;
  readonly direction: 'previous' | 'next';
}) {
  const icon =
    direction === 'previous' ? (
      <ChevronLeft aria-hidden data-icon="inline-start" className="rtl:rotate-180" />
    ) : (
      <ChevronRight aria-hidden data-icon="inline-end" className="rtl:rotate-180" />
    );
  if (screen === null) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        {direction === 'previous' ? icon : null}
        {label}
        {direction === 'next' ? icon : null}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link {...screen.link} title={screen.name} data-testid={`screen-editor-${direction}`}>
        {direction === 'previous' ? icon : null}
        {label}
        {direction === 'next' ? icon : null}
      </Link>
    </Button>
  );
}

export function ScreenEditorHeading({
  back,
  title,
  position,
  actions,
  siblings,
}: {
  readonly back:
    | {
        readonly to: '/onboarding' | '/forms/authorization' | '/forms/terms' | '/forms/custom';
        readonly label: string;
      }
    | {
        // A form the team created (RAPP-700).
        readonly to: '/forms/custom/$formId';
        readonly params: { readonly formId: string };
        readonly label: string;
      };
  readonly title: string;
  readonly position?: string;
  readonly actions?: ReactNode;
  /** The screens before and after it on the board (RAPP-709); null at either end. */
  readonly siblings?: {
    readonly previous: SiblingScreen | null;
    readonly next: SiblingScreen | null;
  };
}) {
  const { t } = useTranslation('settings');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ms-2.5 w-fit text-muted-foreground">
          <Link
            {...('params' in back ? { to: back.to, params: back.params } : { to: back.to })}
            data-testid="screen-editor-back"
          >
            <ChevronLeft aria-hidden data-icon="inline-start" className="rtl:rotate-180" />
            {back.label}
          </Link>
        </Button>
        {siblings === undefined ? null : (
          <nav className="flex items-center gap-2" aria-label={title}>
            <SiblingButton
              screen={siblings.previous}
              label={t('onboardingBoard.previousScreen')}
              direction="previous"
            />
            <SiblingButton
              screen={siblings.next}
              label={t('onboardingBoard.nextScreen')}
              direction="next"
            />
          </nav>
        )}
      </div>
      <PageHeader title={title} description={position} actions={actions} />
    </div>
  );
}

function EditorBody({
  data,
  step,
  number,
  total,
  shown,
}: {
  readonly data: OnboardingDesignData;
  readonly step: BoardStep;
  readonly number: number;
  readonly total: number;
  readonly shown: string | undefined;
}) {
  if (step.kind === 'custom') {
    return (
      <CustomScreenEditor
        data={data}
        screen={step.screen}
        step={step}
        number={number}
        total={total}
      />
    );
  }
  return <AppScreenEditor data={data} step={step} number={number} total={total} shown={shown} />;
}
// A Ramassà screen -----------------------------------------------------------------------------

/** What an open row shows on her phone while staff type. */
function useRowEditing() {
  const [editing, setEditing] = useState<string | null>(null);
  const [builtinLabel, setBuiltinLabel] = useState<BuilderText | undefined>(undefined);
  const [wording, setWording] = useState<TypedWording | null>(null);
  return { editing, setEditing, builtinLabel, setBuiltinLabel, wording, setWording };
}

/**
 * Onboarding is only for players who open the app for the first time
 * (RAPP-705): saving one of its screens saves at once, with no Desa dialog.
 * To ask players who already joined, the team creates a form.
 */
const ONBOARDING_SAVES_AT_ONCE = {
  dialog: null,
  request: async (save: () => Promise<boolean>) => {
    await save();
  },
} as const;

function CustomScreenEditor({
  data,
  screen,
  number,
  total,
}: {
  readonly data: OnboardingDesignData;
  readonly screen: RamassaScreen;
  readonly step: BoardStep;
  readonly number: number;
  readonly total: number;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const catalog = data.intakeCatalog;
  const hideLock = teamHideLockKey(catalog, 'onboarding', screen.id);
  // What it depends on (RAPP-715): a choice question of an earlier screen.
  const key = customStepKey(screen.id);
  const order = movableOrder(catalog);
  const numbers = boardNumbers(catalog);
  const sources = conditionSources(
    catalog,
    order.slice(0, Math.max(order.indexOf(key), 0)),
    'onboarding',
    (each) => ({
      name: onboardingStepName(catalog, each, language, t),
      number: numbers.get(each) ?? '',
      screenKey: routeIdOf(each),
    }),
    language,
  );
  const condition = screen.showWhen ?? null;
  const dependent = useOnboardingAddDependent(catalog, language, t);
  return (
    <StaffScreenEditor
      screen={screen}
      number={number}
      total={total}
      saveKind={ONBOARDING_SAVES_AT_ONCE}
      previewFooter={<AddDependentButton add={dependent.addFor(key)} />}
      family={
        <>
          <FamilyRow members={onboardingFamilyMembers(catalog, key, language, t)} />
          {dependent.dialog}
        </>
      }
      condition={
        <ScreenConditionSection
          // A saved condition starts the section again from what is saved.
          key={JSON.stringify(condition)}
          catalog={catalog}
          screenId={screen.id}
          condition={condition}
          sources={sources}
          isOrphan={condition !== null && onboardingParentOf(catalog, key) === null}
          line={conditionLine(catalog, condition, language, t)}
        />
      }
      hide={{
        isHidden: screen.isHidden === true,
        lockReason: hideLock === null ? null : t(hideLock),
        save: (isHidden) => setScreenHidden(supabase, screen.id, isHidden),
      }}
      phoneQuestions={(language, wording) =>
        placedPhoneQuestions(catalog, screen.id, language, wording)
      }
      onStore={(title, intro) =>
        saveIntakeScreen(supabase, {
          id: screen.id,
          title,
          intro,
          afterScreen: screen.afterScreen,
        })
      }
      fields={(row, language, name) => (
        <ScreenFieldsSection
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

/** What an open row of a screen's list shows on her phone while staff type. */
export type RowEditing = ReturnType<typeof useRowEditing>;

/** The texts of a screen the team made: its title (required) and intro (optional). */
type TeamScreenField = 'title' | 'intro';

/**
 * The hide switch of a screen (RAPP-711), on every screen editor: the app's
 * screens and the team's. Off, with the reason, while the screen always
 * shows; a hidden screen can always be shown again.
 */
function HideScreenField({
  id,
  isHidden,
  lockReason,
  note = null,
  onChange,
}: {
  readonly id: string;
  readonly isHidden: boolean;
  /** Why the screen always shows; null when it can be hidden. */
  readonly lockReason: string | null;
  readonly note?: ReactNode;
  readonly onChange: (isHidden: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{t('onboardingBoard.hideScreen')}</FieldLabel>
        {lockReason === null ? null : <FieldDescription>{lockReason}</FieldDescription>}
        {note}
      </FieldContent>
      <Switch
        id={id}
        checked={isHidden}
        disabled={lockReason !== null && !isHidden}
        onCheckedChange={onChange}
        data-testid={id}
      />
    </Field>
  );
}

/**
 * A screen staff made, beside her phone (RAPP-641): its title and intro, then
 * its fields, consents and signature blocks. A Ramassà screen of Onboarding and
 * a screen of a form the team created (RAPP-700) are both edited here; each
 * says how it saves and which Desa dialog it asks.
 */
export function StaffScreenEditor({
  screen,
  number,
  total,
  saveKind,
  phoneQuestions,
  onStore,
  hide,
  fields,
  family = null,
  previewFooter,
  condition = null,
}: {
  readonly screen: { readonly title: BuilderText; readonly intro: BuilderText | null };
  readonly number: number;
  readonly total: number;
  readonly saveKind: {
    readonly dialog: ReactNode;
    readonly request: (save: () => Promise<boolean>) => Promise<void>;
  };
  /** Her phone's questions, with the wording being typed in an open row. */
  readonly phoneQuestions: (
    language: LanguageCode,
    wording: TypedWording | null,
  ) => readonly PhoneQuestion[];
  readonly onStore: (title: BuilderText, intro: BuilderText | null) => Promise<unknown>;
  /** The hide switch (RAPP-711): saved with the texts, the setting the board's eye saves. */
  readonly hide: {
    readonly isHidden: boolean;
    readonly lockReason: string | null;
    readonly save: (isHidden: boolean) => Promise<void>;
  };
  readonly fields: (row: RowEditing, language: LanguageCode, screenName: string) => ReactNode;
  /** The screen and its follow-ups as small phones, above the editor (RAPP-715). */
  readonly family?: ReactNode;
  /** Under the phone preview: add a dependent screen (RAPP-718). */
  readonly previewFooter?: ReactNode;
  /** "Quan es mostra": the answer that opens it (RAPP-715). */
  readonly condition?: ReactNode;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const reload = useReload();
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  // Only what staff typed here; every other language shows what her phone shows (RAPP-710).
  const [typed, setTyped] = useState<Readonly<Record<TeamScreenField, BuilderText>>>({
    title: {},
    intro: {},
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isHidden, setIsHidden] = useState(hide.isHidden);
  const row = useRowEditing();
  const saved: Readonly<Record<TeamScreenField, BuilderText>> = {
    title: screen.title,
    intro: screen.intro ?? {},
  };
  const isOptional = (field: TeamScreenField) => field === 'intro';
  // The saved text with what is typed over it: her phone reads it by the shared rule.
  const current = (field: TeamScreenField): BuilderText => ({ ...saved[field], ...typed[field] });
  const shownIn = (field: TeamScreenField, shownLanguage: LanguageCode): string =>
    typed[field][shownLanguage] ??
    staffTextIn(saved[field], shownLanguage, isOptional(field)) ??
    (shownLanguage === 'ca' ? '' : shownIn(field, 'ca'));
  const isEmptyRequired = (field: TeamScreenField, shownLanguage: LanguageCode) =>
    !isOptional(field) && shownIn(field, shownLanguage).trim() === '';
  const edit = (field: TeamScreenField, value: string) =>
    setTyped({ ...typed, [field]: { ...typed[field], [language]: value } });
  // What is saved, read the same way (RAPP-751): Desa only for a real change.
  const savedIn = (field: TeamScreenField, shownLanguage: LanguageCode): string =>
    staffTextIn(saved[field], shownLanguage, isOptional(field)) ??
    (shownLanguage === 'ca' ? '' : savedIn(field, 'ca'));
  const TEAM_FIELDS = ['title', 'intro'] as const;
  // The Catalan as the screen opened: what the translate button counts as changed,
  // so a save in between does not hide a change (RAPP-751).
  const [openedCatalan] = useState(() => ({
    title: savedIn('title', 'ca').trim(),
    intro: savedIn('intro', 'ca').trim(),
  }));
  const isChanged =
    isHidden !== hide.isHidden ||
    TEAM_FIELDS.some((field) =>
      SUPPORTED_LANGUAGES.some(
        (each) => shownIn(field, each).trim() !== savedIn(field, each).trim(),
      ),
    );
  /** The fields whose Catalan changed: only those are translated (RAPP-751). */
  const changedCatalan = () =>
    TEAM_FIELDS.filter(
      (field) =>
        shownIn(field, 'ca').trim() !== '' && shownIn(field, 'ca').trim() !== openedCatalan[field],
    );

  /** What is saved: a language still showing the Catalan keeps following it. */
  const toSave = (field: TeamScreenField): BuilderText | undefined =>
    staffTextToSave(
      Object.fromEntries(
        SUPPORTED_LANGUAGES.map((each) => [each, shownIn(field, each)]),
      ) as BuilderText,
      followedTeamText(shownIn(field, 'ca')),
      isOptional(field),
    );

  async function saveScreen() {
    // The title cannot be saved empty: the form turns to the language that is.
    const empty = SUPPORTED_LANGUAGES.find((each) => isEmptyRequired('title', each));
    if (empty !== undefined) {
      setLanguage(empty);
      toast.error(t('builtinScreens.requiredText'));
      return;
    }
    await saveKind.request(storeScreen);
  }

  // Both kinds save the same way; a Nova versió then does what its form asks.
  async function storeScreen(): Promise<boolean> {
    setIsSaving(true);
    try {
      await onStore(toSave('title') ?? {}, toSave('intro') ?? null);
      if (isHidden !== hide.isHidden) await hide.save(isHidden);
      await reload();
      toast.success(t('onboardingBoard.saved'));
      return true;
    } catch {
      toast.error(t('builtinScreens.failed'));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  // Her phone: the fields she is asked, the wording being typed as typed.
  const content = staffScreenContent(
    current('title'),
    current('intro'),
    phoneQuestions(previewLanguage, row.wording),
    previewLanguage,
    t,
  );

  const direction = getLanguageDirection(language);
  return (
    <div className="flex flex-col gap-6">
      {family}
      <EditorColumns
        previewFooter={previewFooter}
        language={language}
        onLanguageChange={setLanguage}
        translatable={{
          texts: () => changedCatalan().map((field) => shownIn(field, 'ca')),
          apply: (target, drafts) => {
            const next = { ...typed };
            for (const field of changedCatalan()) {
              const draft = drafts.get(shownIn(field, 'ca').trim());
              if (draft !== undefined) next[field] = { ...typed[field], [target]: draft };
            }
            setTyped(next);
          },
        }}
        previewLanguage={previewLanguage}
        onPreviewLanguageChange={setPreviewLanguage}
        previewLabel={t('onboardingBoard.phone')}
        previewNote={t('onboardingBoard.phoneNote')}
        previewLanguageLabel={t('onboardingBoard.phoneLanguage')}
        preview={
          <PhoneFrame
            content={content}
            language={previewLanguage}
            step={number}
            total={total}
            highlight={row.editing ?? undefined}
          />
        }
        form={
          <>
            {saveKind.dialog}
            <EditorSection
              title={t('onboardingBoard.screen')}
              testId="screen-texts"
              footer={
                <Button
                  type="button"
                  disabled={isSaving || !isChanged}
                  onClick={() => void saveScreen()}
                  data-testid="screen-save"
                >
                  {t('questions.saveScreen')}
                </Button>
              }
            >
              <FieldGroup>
                <Field orientation="responsive">
                  <FieldContent>
                    <FieldLabel htmlFor="screen-title">{t('questions.screenTitle')}</FieldLabel>
                  </FieldContent>
                  <div className={CONTROL_COLUMN}>
                    <Input
                      id="screen-title"
                      dir={direction}
                      lang={language}
                      value={shownIn('title', language)}
                      aria-invalid={isEmptyRequired('title', language)}
                      onChange={(event) => edit('title', event.target.value)}
                    />
                    {isEmptyRequired('title', language) ? (
                      <FieldError data-testid="screen-title-required">
                        {t('builtinScreens.requiredText')}
                      </FieldError>
                    ) : null}
                  </div>
                </Field>
                <Field orientation="responsive">
                  <FieldContent>
                    <FieldLabel htmlFor="screen-intro">{t('questions.screenIntro')}</FieldLabel>
                  </FieldContent>
                  <div className={CONTROL_COLUMN}>
                    <Textarea
                      id="screen-intro"
                      rows={3}
                      dir={direction}
                      lang={language}
                      value={shownIn('intro', language)}
                      onChange={(event) => edit('intro', event.target.value)}
                    />
                  </div>
                </Field>
                <HideScreenField
                  id="hide-screen"
                  isHidden={isHidden}
                  lockReason={hide.lockReason}
                  onChange={setIsHidden}
                />
              </FieldGroup>
            </EditorSection>

            {condition}

            {fields(row, language, shownIn('title', language) || textIn(screen.title, language))}
          </>
        }
      />
    </div>
  );
}

// An app screen --------------------------------------------------------------------------------

function isQuestionScreen(screen: string): screen is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(screen);
}

/**
 * The family row's + tile on an Onboarding screen (RAPP-717): "Afegeix una
 * pantalla" with the screen being edited as the parent; the new screen's
 * editor opens once it is made.
 */
function useOnboardingAddDependent(
  catalog: IntakeCatalog,
  language: LanguageCode,
  t: Translate,
): ReturnType<typeof useAddDependentScreen> {
  const navigate = useNavigate();
  const create = useCreateOnboardingScreen();
  const order = movableOrder(catalog);
  return useAddDependentScreen({
    catalog,
    sources: onboardingConditionSources(catalog, order, language, t),
    onCreate: async (name, condition) => {
      const key = await create(catalog, name, order, condition);
      await navigate({ to: '/onboarding/screens/$screenId', params: { screenId: routeIdOf(key) } });
    },
  });
}

/**
 * The family row of an Onboarding screen (RAPP-715): the screen at the top of
 * its family and every follow-up below it, depth first, as the board numbers
 * them. An app follow-up opens in its screen's editor.
 */
function onboardingFamilyMembers(
  catalog: IntakeCatalog,
  current: string,
  language: LanguageCode,
  t: Translate,
): readonly FamilyMember[] {
  const order = movableOrder(catalog);
  const numbers = boardNumbers(catalog);
  const root = onboardingRootOf(catalog, current);
  const total = boardRootCount(catalog);
  return onboardingFamily(catalog, root, numbers.get(root) ?? '', order).flatMap(
    (member): FamilyMember[] => {
      const isDetail = isDetailScreen(member.key);
      const step = isDetail ? null : boardStep(catalog, member.key);
      if (!isDetail && step === null) return [];
      const content =
        isDetail || step === null
          ? detailScreenContent(catalog, member.key as EditableWizardScreen, language, t)
          : stepContent(catalog, step, language, t);
      const line =
        member.depth === 0
          ? ''
          : conditionLine(
              catalog,
              onboardingConditionOf(catalog, member.key),
              language,
              t,
              isDetailScreen(member.key) &&
                detailBranch(member.key).condition.repeatsPerAnswer === true,
            );
      return [
        {
          key: member.key,
          number: member.number,
          name: onboardingStepName(catalog, member.key, language, t),
          line,
          depth: member.depth,
          isCurrent: member.key === current,
          picture: (
            <PhoneMiniature
              content={content}
              language={language}
              step={Number.parseInt(member.number, 10) || undefined}
              total={total}
            />
          ),
          link: isDetailScreen(member.key)
            ? {
                to: '/onboarding/screens/$screenId',
                params: { screenId: detailBranch(member.key).parent },
                search: { shown: member.key },
              }
            : { to: '/onboarding/screens/$screenId', params: { screenId: routeIdOf(member.key) } },
        },
      ];
    },
  );
}

function AppScreenEditor({
  data,
  step,
  number,
  total,
  shown,
}: {
  readonly data: OnboardingDesignData;
  readonly step: Exclude<BoardStep, { readonly kind: 'custom' }>;
  readonly number: number;
  readonly total: number;
  readonly shown: string | undefined;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const catalog = data.intakeCatalog;
  const dashboardLanguage = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  const screen = editableScreenOf(step);
  // The app follow-up being edited (RAPP-715): picked in the family row or on its card.
  const detail =
    shown !== undefined &&
    isDetailScreen(shown) &&
    detailBranch(shown).parent === step.key &&
    !catalog.screenSettings?.some((s) => s.screen === shown && s.isDeleted)
      ? shown
      : null;
  const [texts, setTexts] = useState<Partial<Record<EditableWizardScreen, ScreenTexts>>>({});
  const row = useRowEditing();
  const currentSeason = data.seasons.find((season) => season.isCurrent);
  const dependent = useOnboardingAddDependent(catalog, dashboardLanguage, t);

  const questions = step.kind === 'builtin' ? WIZARD_SCREEN_QUESTIONS[step.key] : [];
  const hiddenQuestions = new Set(
    catalog.overrides
      .filter(
        (override) =>
          override.isHidden && canHideBuiltin(override.question, requiredBuiltinQuestions(catalog)),
      )
      .map((override) => override.question),
  );
  const phoneQuestions: PhoneQuestion[] =
    step.kind === 'builtin'
      ? [
          ...questions
            .filter((question) => question === row.editing || !hiddenQuestions.has(question))
            .map((question) =>
              builtinPhoneQuestion(
                catalog,
                question,
                previewLanguage,
                t,
                question === row.editing ? row.builtinLabel : undefined,
              ),
            ),
          // Then the fields placed on it, the wording being typed as typed.
          ...placedPhoneQuestions(catalog, step.key, previewLanguage, row.wording),
        ]
      : [];
  const content =
    detail !== null
      ? detailScreenContent(catalog, detail, previewLanguage, t, texts[detail], row.wording)
      : stepContent(catalog, step, previewLanguage, t, {
          ...(screen === null ? {} : { texts: texts[screen] }),
          ...(step.kind === 'builtin' ? { questions: phoneQuestions } : {}),
          seasonName: currentSeason?.name,
        });

  const phone = (
    <PhoneFrame
      content={content}
      language={previewLanguage}
      step={number}
      total={total}
      highlight={row.editing ?? undefined}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <FamilyRow
        members={onboardingFamilyMembers(catalog, detail ?? step.key, dashboardLanguage, t)}
      />
      {dependent.dialog}
      <EditorColumns
        language={language}
        onLanguageChange={setLanguage}
        previewLanguage={previewLanguage}
        onPreviewLanguageChange={setPreviewLanguage}
        previewLabel={t('onboardingBoard.phone')}
        previewNote={t('onboardingBoard.phoneNote')}
        previewLanguageLabel={t('onboardingBoard.phoneLanguage')}
        previewFooter={
          // The summary and the app terms end the onboarding: nothing depends on them.
          step.kind === 'locked' ? undefined : (
            <AddDependentButton add={dependent.addFor(detail ?? step.key)} />
          )
        }
        preview={phone}
        form={
          detail !== null ? (
            <>
              <WordingSection
                key={detail}
                catalog={catalog}
                screen={detail}
                language={language}
                onLanguageChange={setLanguage}
                title={t(`builtinScreens.screenName.${detail}`)}
                conditionNote={conditionLine(
                  catalog,
                  onboardingConditionOf(catalog, detail),
                  dashboardLanguage,
                  t,
                  detailBranch(detail).condition.repeatsPerAnswer === true,
                )}
                onChange={(next) => setTexts((current) => ({ ...current, [detail]: next }))}
              />
              {/* Its questions, like any screen's (RAPP-720). */}
              <ScreenFieldsSection
                key={`fields-${detail}`}
                catalog={catalog}
                screenKey={detail}
                screenName={t(`builtinScreens.screenName.${detail}`)}
                builtinQuestions={[]}
                language={language}
                editing={row.editing}
                onEdit={row.setEditing}
                onBuiltinLabelChange={row.setBuiltinLabel}
                onWordingChange={row.setWording}
              />
            </>
          ) : (
            <>
              {screen === null ? null : (
                <WordingSection
                  catalog={catalog}
                  screen={screen}
                  language={language}
                  onLanguageChange={setLanguage}
                  title={t('onboardingBoard.wording')}
                  onChange={(next) => setTexts((current) => ({ ...current, [screen]: next }))}
                />
              )}
              {step.kind === 'builtin' ? (
                <ScreenFieldsSection
                  catalog={catalog}
                  screenKey={step.key}
                  screenName={stepName(step, dashboardLanguage, t)}
                  builtinQuestions={questions}
                  language={language}
                  editing={row.editing}
                  onEdit={row.setEditing}
                  onBuiltinLabelChange={row.setBuiltinLabel}
                  onWordingChange={row.setWording}
                />
              ) : null}
            </>
          )
        }
      />
    </div>
  );
}

/**
 * An app screen's own wording and hide switch; the terms screens' buttons too
 * (RAPP-696). What staff see is what she sees (RAPP-710): each field holds the
 * text her phone shows in the language being edited, the saved text or else
 * the app's own. Clearing an optional text removes it from her phone in that
 * language; a required text cannot be saved empty.
 */
export function WordingSection({
  catalog,
  screen,
  language,
  onLanguageChange,
  title,
  conditionNote,
  onChange,
}: {
  readonly catalog: IntakeCatalog;
  readonly screen: EditableWizardScreen;
  readonly language: LanguageCode;
  /** Turns the form to a language with an empty required text when saving. */
  readonly onLanguageChange?: (language: LanguageCode) => void;
  readonly title: string;
  /** When an app follow-up opens (RAPP-715), the line its card shows. */
  readonly conditionNote?: string;
  readonly onChange: (texts: ScreenTexts) => void;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const reload = useReload();
  const saved = screenSettingsFor(catalog, screen);
  const savedTexts: ScreenTexts = saved?.texts ?? {};
  // Only what staff typed here; every other language shows what her phone shows.
  const [typed, setTyped] = useState<Partial<Record<ScreenTextField, BuilderText>>>({});
  const [isHidden, setIsHidden] = useState(saved?.isHidden ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const fields = screenTextFields(screen);
  const direction = getLanguageDirection(language);
  // A required question or field, a signature, or the name keeps it shown (RAPP-642, RAPP-711).
  const hideLock = isQuestionScreen(screen) ? builtinHideLockKey(catalog, screen) : null;
  const hideable = isQuestionScreen(screen) && hideLock === null;
  const bundled = (field: ScreenTextField, shownLanguage: LanguageCode) =>
    bundledScreenText(screen, field, shownLanguage, t);
  // What is saved (or else the app's own text), read the same way (RAPP-751).
  const savedIn = (field: ScreenTextField, shownLanguage: LanguageCode): string =>
    staffTextIn(savedTexts[field], shownLanguage, isOptionalScreenTextField(field)) ??
    bundled(field, shownLanguage);
  const shownIn = (field: ScreenTextField, shownLanguage: LanguageCode): string =>
    typed[field]?.[shownLanguage] ?? savedIn(field, shownLanguage);
  // The Catalan as the screen opened: what the translate button counts as changed,
  // so a save in between does not hide a change (RAPP-751).
  const [openedCatalan] = useState(
    () =>
      Object.fromEntries(fields.map((field) => [field, savedIn(field, 'ca').trim()])) as Readonly<
        Partial<Record<ScreenTextField, string>>
      >,
  );
  const isChanged =
    (hideable && isHidden !== (saved?.isHidden ?? false)) ||
    fields.some((field) =>
      SUPPORTED_LANGUAGES.some(
        (each) => shownIn(field, each).trim() !== savedIn(field, each).trim(),
      ),
    );
  const isEmptyRequired = (field: ScreenTextField, shownLanguage: LanguageCode) =>
    !isOptionalScreenTextField(field) && shownIn(field, shownLanguage).trim() === '';

  const write = (changes: readonly (readonly [ScreenTextField, LanguageCode, string])[]) => {
    const next = { ...typed };
    for (const [field, each, value] of changes) next[field] = { ...next[field], [each]: value };
    setTyped(next);
    // Her phone: the saved wording with what is typed over it.
    onChange(
      Object.fromEntries(
        fields.map((each) => [each, { ...savedTexts[each], ...next[each] }]),
      ) as ScreenTexts,
    );
  };
  const edit = (field: ScreenTextField, value: string) => write([[field, language, value]]);
  // Only the wording whose Catalan changed since the screen opened is translated (RAPP-751).
  const changedWording = () =>
    fields.flatMap((field) => {
      const text = shownIn(field, 'ca').trim();
      return text === '' || text === openedCatalan[field] ? [] : [[field, text] as const];
    });
  useTranslatableTexts({
    texts: () => changedWording().map(([, text]) => text),
    apply: (target, drafts) =>
      write(
        changedWording().flatMap(([field, text]) => {
          const draft = drafts.get(text.trim());
          return draft === undefined ? [] : [[field, target, draft] as const];
        }),
      ),
  });

  // Onboarding is only for players who have not joined yet (RAPP-705): a save
  // changes what they will see, so it saves at once.
  async function store() {
    const empty = SUPPORTED_LANGUAGES.find((each) =>
      fields.some((field) => isEmptyRequired(field, each)),
    );
    if (empty !== undefined) {
      onLanguageChange?.(empty);
      toast.error(t('builtinScreens.requiredText'));
      return;
    }
    const texts = Object.fromEntries(
      fields.flatMap((field) => {
        const shown = Object.fromEntries(
          SUPPORTED_LANGUAGES.map((each) => [each, shownIn(field, each)]),
        ) as BuilderText;
        const text = staffTextToSave(
          shown,
          (each) => bundled(field, each),
          isOptionalScreenTextField(field),
        );
        return text === undefined ? [] : [[field, text]];
      }),
    ) as ScreenTexts;
    setIsSaving(true);
    try {
      await saveBuiltinScreen(supabase, { screen, texts, isHidden: hideable && isHidden });
      await reload();
      toast.success(t('builtinScreens.saved'));
    } catch {
      toast.error(t('builtinScreens.failed'));
    } finally {
      setIsSaving(false);
    }
  }

  const note = DETAIL_SCREEN_PARENTS[screen] === undefined ? null : t('builtinScreens.detailNote');

  return (
    <EditorSection
      title={title}
      testId={`wording-${screen}`}
      footer={
        <Button
          type="button"
          disabled={isSaving || !isChanged}
          onClick={() => void store()}
          data-testid={`wording-save-${screen}`}
        >
          {t('builtinScreens.save')}
        </Button>
      }
    >
      <FieldGroup>
        {note === null || screen === 'terms-intro' ? null : (
          <FieldDescription className="text-start">{note}</FieldDescription>
        )}
        {conditionNote === undefined || conditionNote === '' ? null : (
          <FieldDescription className="text-start" data-testid="wording-condition">
            {conditionNote}
          </FieldDescription>
        )}
        {/* Every player checks her names first (RAPP-708): staff read why. */}
        {screen === 'identity' ? (
          <FieldDescription className="text-start" data-testid="identity-note">
            {t('builtinScreens.identityNote')}
          </FieldDescription>
        ) : null}
        {fields.map((field) => {
          const id = `wording-${screen}-${field}`;
          const isInvalid = isEmptyRequired(field, language);
          const shared = {
            id,
            dir: direction,
            lang: language,
            value: shownIn(field, language),
            'aria-invalid': isInvalid,
          } as const;
          return (
            <Field key={field} orientation="responsive" data-invalid={isInvalid}>
              <FieldContent>
                <FieldLabel htmlFor={id}>{t(`builtinScreens.field.${field}`)}</FieldLabel>
              </FieldContent>
              <div className={CONTROL_COLUMN}>
                {field === 'help' ? (
                  <Textarea
                    {...shared}
                    rows={3}
                    onChange={(event) => edit(field, event.target.value)}
                  />
                ) : (
                  <Input {...shared} onChange={(event) => edit(field, event.target.value)} />
                )}
                {isInvalid ? (
                  <FieldError data-testid={`wording-required-${field}`}>
                    {t('builtinScreens.requiredText')}
                  </FieldError>
                ) : null}
              </div>
            </Field>
          );
        })}
        {isQuestionScreen(screen) ? (
          <HideScreenField
            id={`hide-${screen}`}
            isHidden={hideable && isHidden}
            lockReason={hideLock === null ? null : t(hideLock)}
            note={
              // Re-registration follows the same hide (RAPP-612): one rule for both.
              hideable && (SEASON_WIZARD_SCREENS as readonly string[]).includes(screen) ? (
                <FieldDescription>{t('builtinScreens.hideReregistrationNote')}</FieldDescription>
              ) : null
            }
            onChange={setIsHidden}
          />
        ) : null}
      </FieldGroup>
    </EditorSection>
  );
}
