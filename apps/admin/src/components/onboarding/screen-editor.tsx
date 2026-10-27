/**
 * One onboarding screen's editor (RAPP-641), opened from its card on the
 * registration board. The form sits on the start side and her phone on the
 * end side, drawn from what staff type before they save.
 *
 *   - A Ramassà screen: its title and intro, and the fields of the Fitxa
 *     placed on it (RAPP-651). It is deleted (archived) here.
 *   - An app screen: its wording per language and its hide switch (RAPP-612),
 *     its own questions reworded, hidden or made required, then the fields
 *     placed on it. The document screen adds its note (RAPP-302), and a
 *     screen with a detail screen edits that one's wording too.
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
import {
  OnboardingDocumentSection,
  useReload,
} from '@/components/settings/onboarding-design-sections';
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
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
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
  archiveIntakeScreen,
  canHideBuiltin,
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
  editableScreenOf,
  routeIdOf,
  stepFromRouteId,
  type BoardStep,
} from './board-steps';
import { ConfirmDialog } from './confirm-dialog';
import { PhoneFrame, SteppedPhone } from './phone-preview';
import { stepName, type BoardCardLink } from './screen-board';
import {
  builtinPhoneQuestion,
  bundledScreenText,
  detailScreenContent,
  placedPhoneQuestions,
  staffScreenContent,
  stepContent,
  type PhoneContent,
  type PhoneQuestion,
  type PhoneScreen,
  type ScreenTexts,
  type Translate,
  type TypedWording,
} from './screen-content';
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
  /** The phone's tab to open on: a branch card opens its follow-up screen (RAPP-713). */
  readonly shown?: PhoneScreen;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const catalog = data.intakeCatalog;
  const step = stepFromRouteId(catalog, routeId);
  const steps = allSteps(catalog);
  const number = step === null ? 0 : steps.findIndex((each) => each.key === step.key) + 1;

  return (
    <Page data-testid="screen-editor-page">
      <ScreenEditorHeading
        back={{ to: '/onboarding', label: t('onboardingPage.title') }}
        siblings={
          step === null
            ? undefined
            : {
                previous: onboardingSibling(steps[number - 2], language, t),
                next: onboardingSibling(steps[number], language, t),
              }
        }
        title={step === null ? t('onboardingBoard.notFound') : stepName(step, language, t)}
        position={
          step === null ? undefined : t('onboardingBoard.stepOf', { number, total: steps.length })
        }
        actions={
          step?.kind === 'custom' ? (
            <OnboardingDeleteScreen screen={step.screen} name={stepName(step, language, t)} />
          ) : undefined
        }
      />
      {step === null ? null : (
        // Keyed by the screen: another screen starts from what is saved.
        <EditorBody
          key={step.key}
          data={data}
          step={step}
          number={number}
          total={steps.length}
          shown={shown}
        />
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

function OnboardingDeleteScreen({
  screen,
  name,
}: {
  readonly screen: RamassaScreen;
  readonly name: string;
}) {
  const navigate = useNavigate();
  return (
    <DeleteScreenButton
      name={name}
      onDelete={async () => {
        // Archived: the fields leave the screen and stay on the Fitxa with her answers (RAPP-656).
        await archiveIntakeScreen(supabase, screen.id);
        await navigate({ to: '/onboarding' });
      }}
    />
  );
}

/**
 * Deleting a screen staff made, on Onboarding or a form the team created
 * (RAPP-700): asked once, then `onDelete` archives it and goes back.
 */
export function DeleteScreenButton({
  name,
  onDelete,
}: {
  readonly name: string;
  readonly onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  async function remove() {
    try {
      await onDelete();
      await router.invalidate();
      toast.success(t('onboardingBoard.deleted', { screen: name }));
    } catch {
      toast.error(t('onboardingBoard.deleteFailed'));
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setIsOpen(true)}
        data-testid="screen-delete"
      >
        <Trash2 aria-hidden data-icon="inline-start" />
        {t('onboardingBoard.deleteScreen')}
      </Button>
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={t('onboardingBoard.deleteScreenTitle')}
        description={t('onboardingBoard.deleteScreenBody')}
        action={t('onboardingBoard.delete')}
        onConfirm={() => void remove()}
      />
    </>
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
  readonly shown: PhoneScreen;
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
  const { t } = useTranslation('settings');
  const catalog = data.intakeCatalog;
  const hideLock = teamHideLockKey(catalog, 'onboarding', screen.id);
  return (
    <StaffScreenEditor
      screen={screen}
      number={number}
      total={total}
      saveKind={ONBOARDING_SAVES_AT_ONCE}
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
    <EditorColumns
      language={language}
      onLanguageChange={setLanguage}
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
                disabled={isSaving}
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

          {fields(row, language, shownIn('title', language) || textIn(screen.title, language))}
        </>
      }
    />
  );
}

// An app screen --------------------------------------------------------------------------------

function isQuestionScreen(screen: string): screen is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(screen);
}

/** The detail screen that opens from a question screen, if it has one. */
function detailOf(screen: EditableWizardScreen): EditableWizardScreen | null {
  const entry = Object.entries(DETAIL_SCREEN_PARENTS).find(([, parent]) => parent === screen);
  return entry === undefined ? null : (entry[0] as EditableWizardScreen);
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
  readonly shown: PhoneScreen;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const catalog = data.intakeCatalog;
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  const screen = editableScreenOf(step);
  const detail = screen === null ? null : detailOf(screen);
  const [texts, setTexts] = useState<Partial<Record<EditableWizardScreen, ScreenTexts>>>({});
  const [shownScreen, setShownScreen] = useState<PhoneScreen>(detail === null ? 'main' : shown);
  const row = useRowEditing();
  const currentSeason = data.seasons.find((season) => season.isCurrent);

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
    shownScreen === 'detail' && detail !== null
      ? detailScreenContent(catalog, detail, previewLanguage, t, texts[detail])
      : stepContent(catalog, step, previewLanguage, t, {
          ...(screen === null ? {} : { texts: texts[screen] }),
          ...(step.kind === 'builtin' ? { questions: phoneQuestions } : {}),
          documentNote:
            data.documentExplanation === null
              ? ''
              : textIn(data.documentExplanation as BuilderText, previewLanguage),
          seasonName: currentSeason?.name,
        });

  const phone = (
    <SteppedPhone
      steps={
        detail === null || screen === null
          ? []
          : [
              { value: 'main', label: t(`builtinScreens.screenName.${screen}`) },
              { value: 'detail', label: t(`builtinScreens.screenName.${detail}`) },
            ]
      }
      shown={shownScreen}
      onShow={setShownScreen}
      label={t('onboardingBoard.phone')}
      content={content}
      language={previewLanguage}
      step={number}
      total={total}
      highlight={row.editing ?? undefined}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      <EditorColumns
        language={language}
        onLanguageChange={setLanguage}
        previewLanguage={previewLanguage}
        onPreviewLanguageChange={setPreviewLanguage}
        previewLabel={t('onboardingBoard.phone')}
        previewNote={t('onboardingBoard.phoneNote')}
        previewLanguageLabel={t('onboardingBoard.phoneLanguage')}
        preview={phone}
        form={
          <>
            {screen === null ? null : (
              <WordingSection
                catalog={catalog}
                screen={screen}
                language={language}
                onLanguageChange={setLanguage}
                title={t('onboardingBoard.wording')}
                onChange={(next) => {
                  setTexts((current) => ({ ...current, [screen]: next }));
                  setShownScreen('main');
                }}
              />
            )}
            {detail === null ? null : (
              <WordingSection
                catalog={catalog}
                screen={detail}
                language={language}
                onLanguageChange={setLanguage}
                title={t(`builtinScreens.screenName.${detail}`)}
                onChange={(next) => {
                  setTexts((current) => ({ ...current, [detail]: next }));
                  setShownScreen('detail');
                }}
              />
            )}
            {step.kind === 'builtin' ? (
              <ScreenFieldsSection
                catalog={catalog}
                screenKey={step.key}
                screenName={stepName(step, (i18n.resolvedLanguage ?? 'ca') as LanguageCode, t)}
                builtinQuestions={questions}
                language={language}
                editing={row.editing}
                onEdit={(id) => {
                  row.setEditing(id);
                  setShownScreen('main');
                }}
                onBuiltinLabelChange={row.setBuiltinLabel}
                onWordingChange={row.setWording}
              />
            ) : null}
            {step.key === 'documentation' ? (
              <OnboardingDocumentSection explanation={data.documentExplanation} />
            ) : null}
          </>
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
  onChange,
}: {
  readonly catalog: IntakeCatalog;
  readonly screen: EditableWizardScreen;
  readonly language: LanguageCode;
  /** Turns the form to a language with an empty required text when saving. */
  readonly onLanguageChange?: (language: LanguageCode) => void;
  readonly title: string;
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
  const shownIn = (field: ScreenTextField, shownLanguage: LanguageCode): string =>
    typed[field]?.[shownLanguage] ??
    staffTextIn(savedTexts[field], shownLanguage, isOptionalScreenTextField(field)) ??
    bundled(field, shownLanguage);
  const isEmptyRequired = (field: ScreenTextField, shownLanguage: LanguageCode) =>
    !isOptionalScreenTextField(field) && shownIn(field, shownLanguage).trim() === '';

  const edit = (field: ScreenTextField, value: string) => {
    const next = { ...typed, [field]: { ...typed[field], [language]: value } };
    setTyped(next);
    // Her phone: the saved wording with what is typed over it.
    onChange(
      Object.fromEntries(
        fields.map((each) => [each, { ...savedTexts[each], ...next[each] }]),
      ) as ScreenTexts,
    );
  };

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
          disabled={isSaving}
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
