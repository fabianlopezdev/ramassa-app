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
 *   - The terms and the season authorization keep their own editors
 *     (RAPP-613, RAPP-614), under the screen's wording.
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
  OnboardingAppTermsSection,
  OnboardingAuthorizationSection,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { OnboardingDesignData } from '@/lib/onboarding-design';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
import { PhoneFrame } from './phone-preview';
import { stepName } from './screen-board';
import {
  builtinPhoneQuestion,
  builtinWording,
  placedPhoneQuestions,
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
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="-ms-2.5 w-fit text-muted-foreground">
          <Link to="/onboarding" data-testid="screen-editor-back">
            <ChevronLeft aria-hidden data-icon="inline-start" className="rtl:rotate-180" />
            {t('onboardingPage.title')}
          </Link>
        </Button>
        {step === null ? (
          <PageHeader title={t('onboardingBoard.notFound')} />
        ) : (
          <EditorHeader
            step={step}
            name={stepName(step, language, t)}
            position={t('onboardingBoard.stepOf', { number, total: steps.length })}
          />
        )}
      </div>
      {step === null ? null : (
        // Keyed by the screen: another screen starts from what is saved.
        <EditorBody key={step.key} data={data} step={step} number={number} total={steps.length} />
      )}
    </Page>
  );
}

function EditorHeader({
  step,
  name,
  position,
}: {
  readonly step: BoardStep;
  readonly name: string;
  readonly position: string;
}) {
  return (
    <PageHeader
      title={name}
      description={position}
      actions={step.kind === 'custom' ? <DeleteScreen screen={step.screen} name={name} /> : null}
    />
  );
}

function DeleteScreen({ screen, name }: { readonly screen: RamassaScreen; readonly name: string }) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  async function remove() {
    try {
      // Archived: the fields leave the screen and stay on the Fitxa with her answers (RAPP-656).
      await archiveIntakeScreen(supabase, screen.id);
      await navigate({ to: '/onboarding' });
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

function CustomScreenEditor({
  data,
  screen,
  step,
  number,
  total,
}: {
  readonly data: OnboardingDesignData;
  readonly screen: RamassaScreen;
  readonly step: BoardStep;
  readonly number: number;
  readonly total: number;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const catalog = data.intakeCatalog;
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
    setIsSaving(true);
    try {
      await saveIntakeScreen(supabase, {
        id: screen.id,
        title,
        intro: Object.values(intro).some((value) => (value ?? '').trim() !== '') ? intro : null,
        afterScreen: screen.afterScreen,
      });
      await reload();
      toast.success(t('onboardingBoard.saved'));
    } catch {
      toast.error(t('builtinScreens.failed'));
    } finally {
      setIsSaving(false);
    }
  }

  // Her phone: the fields she is asked, the wording being typed as typed.
  const content = stepContent(catalog, step, previewLanguage, t, {
    title,
    intro,
    questions: placedPhoneQuestions(catalog, screen.id, previewLanguage, row.wording),
  });

  const direction = getLanguageDirection(language);
  return (
    <EditorColumns
      language={language}
      onLanguageChange={setLanguage}
      previewLanguage={previewLanguage}
      onPreviewLanguageChange={setPreviewLanguage}
      previewLabel={t('onboardingBoard.phone')}
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

          <ScreenFieldsSection
            catalog={catalog}
            screenKey={screen.id}
            screenName={textIn(title, language) || textIn(screen.title, language)}
            builtinQuestions={[]}
            language={language}
            editing={row.editing}
            onEdit={row.setEditing}
            onBuiltinLabelChange={row.setBuiltinLabel}
            onWordingChange={row.setWording}
          />
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
    <div className="flex w-full flex-col items-center gap-4">
      {detail === null || screen === null ? null : (
        <Tabs
          value={shownScreen}
          onValueChange={(next) => setShownScreen(next as 'main' | 'detail')}
        >
          <TabsList aria-label={t('onboardingBoard.phone')}>
            <TabsTrigger value="main">{t(`builtinScreens.screenName.${screen}`)}</TabsTrigger>
            <TabsTrigger value="detail">{t(`builtinScreens.screenName.${detail}`)}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <PhoneFrame
        content={content}
        language={previewLanguage}
        step={number}
        total={total}
        highlight={row.editing ?? undefined}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <EditorColumns
        language={language}
        onLanguageChange={setLanguage}
        previewLanguage={previewLanguage}
        onPreviewLanguageChange={setPreviewLanguage}
        previewLabel={t('onboardingBoard.phone')}
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
            {step.key === 'terms-intro' ? (
              <EditorSection
                title={t('appTerms.sectionTitle')}
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/onboarding/screens/$screenId" params={{ screenId: 'terms' }}>
                      {t('onboardingBoard.edit')}
                    </Link>
                  </Button>
                }
              >
                <p className="text-start text-sm text-muted-foreground">
                  {t('builtinScreens.termsTitleNote')}
                </p>
              </EditorSection>
            ) : null}
          </>
        }
      />
      {/* The legal texts keep their own editors, with their versions and previews. */}
      {step.key === 'terms' ? (
        <OnboardingAppTermsSection
          versions={data.termsVersions}
          canPublish={data.canPublishTerms}
        />
      ) : null}
      {step.key === 'authorization' ? (
        <OnboardingAuthorizationSection
          seasons={data.seasons}
          versions={data.versions}
          canPublish={data.canPublishTerms}
        />
      ) : null}
    </div>
  );
}

function WordingSection({
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

  async function save() {
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

  const note =
    screen === 'terms-intro' || screen === 'terms'
      ? t('builtinScreens.termsTitleNote')
      : DETAIL_SCREEN_PARENTS[screen] === undefined
        ? null
        : t('builtinScreens.detailNote');

  return (
    <EditorSection
      title={title}
      testId={`wording-${screen}`}
      footer={
        <Button
          type="button"
          disabled={isSaving}
          onClick={() => void save()}
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
