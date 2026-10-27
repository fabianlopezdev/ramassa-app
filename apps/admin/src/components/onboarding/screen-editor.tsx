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
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { OnboardingDesignData } from '@/lib/onboarding-design';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
import {
  BUNDLED_SCREEN_TEXT_KEYS,
  DETAIL_SCREEN_PARENTS,
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
  canHideBuiltinScreen,
  hasRequiredPlacedField,
  requiredBuiltinQuestions,
  saveBuiltinScreen,
  saveIntakeScreen,
  screenSettingsFor,
  textIn,
  type BuilderText,
  type IntakeCatalog,
  type RamassaScreen,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { allSteps, editableScreenOf, stepFromRouteId, type BoardStep } from './board-steps';
import { ConfirmDialog } from './confirm-dialog';
import { PhoneFrame, SteppedPhone } from './phone-preview';
import { stepName } from './screen-board';
import {
  builtinPhoneQuestion,
  builtinWording,
  placedPhoneQuestions,
  staffScreenContent,
  stepContent,
  type PhoneContent,
  type PhoneQuestion,
  type ScreenTexts,
  type TypedWording,
} from './screen-content';
import { ScreenFieldsSection } from './screen-fields';

/** The control column of a setting row, as on the account page: one width, natural controls. */
const CONTROL_COLUMN = 'flex w-full flex-col gap-2 @md/field-group:w-100!';

export function ScreenEditor({
  data,
  routeId,
}: {
  readonly data: OnboardingDesignData;
  readonly routeId: string;
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
        <EditorBody key={step.key} data={data} step={step} number={number} total={steps.length} />
      )}
    </Page>
  );
}

/**
 * Every form's screen editor heading (RAPP-641, shared by every form since
 * RAPP-696): back to its board, the screen's name and its place on it.
 */
export function ScreenEditorHeading({
  back,
  title,
  position,
  actions,
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
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button asChild variant="ghost" size="sm" className="-ms-2.5 w-fit text-muted-foreground">
        <Link
          {...('params' in back ? { to: back.to, params: back.params } : { to: back.to })}
          data-testid="screen-editor-back"
        >
          <ChevronLeft aria-hidden data-icon="inline-start" className="rtl:rotate-180" />
          {back.label}
        </Link>
      </Button>
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
}: {
  readonly data: OnboardingDesignData;
  readonly step: BoardStep;
  readonly number: number;
  readonly total: number;
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
  return <AppScreenEditor data={data} step={step} number={number} total={total} />;
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
  const catalog = data.intakeCatalog;
  return (
    <StaffScreenEditor
      screen={screen}
      number={number}
      total={total}
      saveKind={ONBOARDING_SAVES_AT_ONCE}
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
  readonly fields: (row: RowEditing, language: LanguageCode, screenName: string) => ReactNode;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const reload = useReload();
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  const [title, setTitle] = useState<BuilderText>(screen.title);
  const [intro, setIntro] = useState<BuilderText>(screen.intro ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const row = useRowEditing();

  async function saveScreen() {
    if ((title.ca ?? '').trim() === '') {
      setLanguage('ca');
      toast.error(t('questions.catalanNeeded'));
      return;
    }
    await saveKind.request(storeScreen);
  }

  // Both kinds save the same way; a Nova versió then does what its form asks.
  async function storeScreen(): Promise<boolean> {
    setIsSaving(true);
    try {
      await onStore(
        title,
        Object.values(intro).some((value) => (value ?? '').trim() !== '') ? intro : null,
      );
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
    title,
    intro,
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
                    value={title[language] ?? ''}
                    placeholder={language === 'ca' ? '' : (title.ca ?? '')}
                    onChange={(event) => setTitle({ ...title, [language]: event.target.value })}
                  />
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
                    value={intro[language] ?? ''}
                    placeholder={language === 'ca' ? '' : (intro.ca ?? '')}
                    onChange={(event) => setIntro({ ...intro, [language]: event.target.value })}
                  />
                </div>
              </Field>
            </FieldGroup>
          </EditorSection>

          {fields(row, language, textIn(title, language) || textIn(screen.title, language))}
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
}: {
  readonly data: OnboardingDesignData;
  readonly step: Exclude<BoardStep, { readonly kind: 'custom' }>;
  readonly number: number;
  readonly total: number;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const catalog = data.intakeCatalog;
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  const screen = editableScreenOf(step);
  const detail = screen === null ? null : detailOf(screen);
  const [texts, setTexts] = useState<Partial<Record<EditableWizardScreen, ScreenTexts>>>({});
  const [shownScreen, setShownScreen] = useState<'main' | 'detail'>('main');
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
  const detailContent = (): PhoneContent => {
    const wording = builtinWording(
      detail as EditableWizardScreen,
      texts[detail as EditableWizardScreen] ??
        screenSettingsFor(catalog, detail as EditableWizardScreen)?.texts ??
        {},
      previewLanguage,
      t,
    );
    return {
      title: wording.title,
      intro: wording.intro,
      help: wording.help,
      questions: [],
      lines: [],
      checkbox: null,
      signature: false,
      continueLabel: wording.continue_label,
      declineLabel: null,
    };
  };
  const content =
    shownScreen === 'detail' && detail !== null
      ? detailContent()
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

/** An app screen's own wording and hide switch; the terms screens' buttons too (RAPP-696). */
export function WordingSection({
  catalog,
  screen,
  language,
  title,
  onChange,
}: {
  readonly catalog: IntakeCatalog;
  readonly screen: EditableWizardScreen;
  readonly language: LanguageCode;
  readonly title: string;
  readonly onChange: (texts: ScreenTexts) => void;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const reload = useReload();
  const saved = screenSettingsFor(catalog, screen);
  const [texts, setTexts] = useState<Partial<Record<ScreenTextField, BuilderText>>>(
    saved?.texts ?? {},
  );
  const [isHidden, setIsHidden] = useState(saved?.isHidden ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const fields = screenTextFields(screen);
  const direction = getLanguageDirection(language);
  const hideable =
    isQuestionScreen(screen) &&
    canHideBuiltinScreen(screen, requiredBuiltinQuestions(catalog)) &&
    // A required field placed on it keeps the screen shown (RAPP-642).
    !hasRequiredPlacedField(catalog, screen);
  const bundled = (field: ScreenTextField): string => {
    const key = BUNDLED_SCREEN_TEXT_KEYS[screen][field];
    return key === undefined ? '' : t(`onboarding:${key}`, { lng: language });
  };

  const edit = (field: ScreenTextField, value: string) => {
    const next = { ...texts, [field]: { ...texts[field], [language]: value } };
    setTexts(next);
    onChange(next);
  };

  // Onboarding is only for players who have not joined yet (RAPP-705): a save
  // changes what they will see, so it saves at once.
  async function store() {
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
        {fields.map((field) => {
          const id = `wording-${screen}-${field}`;
          const shared = {
            id,
            dir: direction,
            lang: language,
            placeholder: bundled(field),
            value: texts[field]?.[language] ?? '',
          } as const;
          return (
            <Field key={field} orientation="responsive">
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
              </div>
            </Field>
          );
        })}
        {isQuestionScreen(screen) ? (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`hide-${screen}`}>{t('onboardingBoard.hideScreen')}</FieldLabel>
              {hideable ? null : (
                <FieldDescription>{t('builtinScreens.hideLocked')}</FieldDescription>
              )}
              {/* Re-registration follows the same hide (RAPP-612): one rule for both. */}
              {hideable && (SEASON_WIZARD_SCREENS as readonly string[]).includes(screen) ? (
                <FieldDescription>{t('builtinScreens.hideReregistrationNote')}</FieldDescription>
              ) : null}
            </FieldContent>
            <Switch
              id={`hide-${screen}`}
              checked={hideable && isHidden}
              disabled={!hideable}
              onCheckedChange={setIsHidden}
              data-testid={`hide-${screen}`}
            />
          </Field>
        ) : null}
      </FieldGroup>
    </EditorSection>
  );
}
