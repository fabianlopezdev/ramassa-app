/**
 * The last step of creating a participant (RAPP-618, RAPP-643): her own copy
 * of the Onboarding board. The board is the template; here staff decide what
 * this one player is asked, before the invitation exists.
 *
 * Each screen her plan can show is a card, in her order, with the board's
 * phone miniature drawn from her choices. A card's switch asks or skips the
 * whole screen: skipping sets each of its questions to Don't ask. Opening a
 * card lists its questions, the app's own and Ramassà's in one list, each with
 * Auto, Ask or Don't ask (RAPP-301). Don't ask is not offered on a required
 * question nobody answered, and a screen holding one cannot be skipped. The
 * summary, the terms and the authorization always end it, locked.
 *
 * What she is asked is computed with the same shared functions her phone
 * plans with (`previewWizardQuestions` for the app's questions). The presets
 * fill every choice at once.
 */

import { allSteps, type BoardStep } from '@/components/onboarding/board-steps';
import { PhoneMiniature } from '@/components/onboarding/phone-preview';
import { BOARD_GRID, CardFrame, stepName } from '@/components/onboarding/screen-board';
import {
  builtinPhoneQuestion,
  customPhoneQuestion,
  stepContent,
  type PhoneQuestion,
} from '@/components/onboarding/screen-content';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { QUESTION_LABEL_KEYS } from '@/lib/builtin-questions';
import { cn } from '@/lib/utils';
import { EyeOff, Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  INTAKE_STATE_PRESETS,
  previewWizardQuestions,
  WIZARD_SCREEN_QUESTIONS,
  type AnsweredQuestions,
  type IntakeQuestion,
  type IntakeQuestionState,
  type QuestionStates,
  type WizardQuestionAsking,
  type WizardQuestionPreview,
} from '@ramassa/shared/intake';
import {
  builtinLabel,
  canSkipCustomQuestion,
  hiddenBuiltinQuestions,
  holderOf,
  isAskedOfHer,
  requiredBuiltinQuestions,
  textIn,
  wizardFlow,
  type CustomQuestion,
  type CustomQuestionStates,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

const ASKING_LABEL_KEYS: Readonly<Record<WizardQuestionAsking, string>> = {
  asked: 'participants:inviteQuestionAsked',
  'when-it-applies': 'participants:inviteQuestionAskedWhenItApplies',
  'not-asked': 'participants:inviteQuestionNotAsked',
};

const CHOICE_LABEL_KEYS: Readonly<Record<IntakeQuestionState, string>> = {
  auto: 'participants:inviteChoiceAuto',
  ask: 'participants:inviteChoiceAsk',
  skip: 'participants:inviteChoiceSkip',
};

export interface InviteQuestionsReviewProps {
  /** What the invitation will record as answered. */
  readonly answered: AnsweredQuestions;
  readonly states: QuestionStates;
  readonly onChange: (next: QuestionStates) => void;
  /** Her choices on Ramassà's own questions (RAPP-643); none means Auto on each. */
  readonly customStates?: CustomQuestionStates;
  readonly onCustomChange?: (next: CustomQuestionStates) => void;
  readonly catalog: IntakeCatalog;
}

/** One question of a screen, the app's or Ramassà's, as this step shows it. */
interface QuestionRow {
  readonly kind: 'builtin' | 'custom';
  readonly key: string;
  readonly label: string;
  readonly state: IntakeQuestionState;
  readonly asking: WizardQuestionAsking;
  readonly canSkip: boolean;
  readonly phone: PhoneQuestion;
  readonly set: (state: IntakeQuestionState) => void;
}

interface ScreenView {
  readonly step: BoardStep;
  readonly number: number;
  readonly name: string;
  readonly rows: readonly QuestionRow[];
}

function withState(
  states: QuestionStates,
  question: IntakeQuestion,
  state: IntakeQuestionState,
): QuestionStates {
  const next: Partial<Record<IntakeQuestion, 'ask' | 'skip'>> = { ...states };
  if (state === 'auto') delete next[question];
  else next[question] = state;
  return next;
}

function withCustomState(
  states: CustomQuestionStates,
  questionId: string,
  state: IntakeQuestionState,
): CustomQuestionStates {
  const next: Record<string, 'ask' | 'skip'> = { ...states };
  if (state === 'auto') delete next[questionId];
  else next[questionId] = state;
  return next;
}

/** Her questions of a screen: the app's own, then Ramassà's, never a removed one. */
function questionsOf(step: BoardStep, catalog: IntakeCatalog) {
  const live = (questions: readonly CustomQuestion[]) =>
    questions.filter((question) => !question.isArchived && isAskedOfHer(question));
  if (step.kind === 'custom') return { builtin: [], custom: live(step.screen.questions) };
  if (step.kind === 'locked') return { builtin: [], custom: [] };
  return {
    builtin: WIZARD_SCREEN_QUESTIONS[step.key],
    custom: live(holderOf(catalog, step.key)?.questions ?? []),
  };
}

export function InviteQuestionsReview({
  answered,
  states,
  onChange,
  customStates = {},
  onCustomChange = () => undefined,
  catalog,
}: InviteQuestionsReviewProps) {
  const { t, i18n } = useTranslation(['participants', 'settings', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const flow = wizardFlow(catalog);
  const previews = new Map<IntakeQuestion, WizardQuestionPreview>(
    // The organization's removed questions and required list, as her phone reads them.
    previewWizardQuestions(
      answered,
      states,
      hiddenBuiltinQuestions(catalog),
      flow,
      requiredBuiltinQuestions(catalog),
    ).map((row) => [row.question, row]),
  );
  const rowsOf = (step: BoardStep): QuestionRow[] => {
    const { builtin, custom } = questionsOf(step, catalog);
    return [
      ...builtin.flatMap((question): QuestionRow[] => {
        const preview = previews.get(question);
        if (preview === undefined || preview.isRemoved) return [];
        // A preset may hold Don't ask where it is not allowed: Auto is what is saved.
        const state = preview.state === 'skip' && !preview.canSkip ? 'auto' : preview.state;
        return [
          {
            kind: 'builtin',
            key: question,
            label:
              builtinLabel(catalog, question, language) ??
              t(QUESTION_LABEL_KEYS[question] ?? question),
            state,
            asking: preview.asking,
            canSkip: preview.canSkip,
            phone: builtinPhoneQuestion(catalog, question, language, t),
            set: (next) => onChange(withState(states, question, next)),
          },
        ];
      }),
      ...custom.map((question): QuestionRow => {
        const canSkip = canSkipCustomQuestion(question);
        const saved = customStates[question.id] ?? 'auto';
        const state = saved === 'skip' && !canSkip ? 'auto' : saved;
        return {
          kind: 'custom',
          key: question.id,
          label: textIn(question.label, language),
          state,
          // She has answered none of them yet: Auto asks, as Ask does.
          asking:
            state === 'skip'
              ? 'not-asked'
              : question.showWhen === undefined
                ? 'asked'
                : 'when-it-applies',
          canSkip,
          phone: customPhoneQuestion(question, language),
          set: (next) => onCustomChange(withCustomState(customStates, question.id, next)),
        };
      }),
    ];
  };

  // Only the screens her plan can show: none staff hid, none with nothing for her.
  const screens: ScreenView[] = allSteps(catalog)
    .flatMap((step) => {
      if (step.kind === 'builtin' && flow.hiddenScreens.has(step.key)) return [];
      const rows = rowsOf(step);
      return step.kind !== 'locked' && rows.length === 0 ? [] : [{ step, rows }];
    })
    .map(({ step, rows }, index) => ({
      step,
      rows,
      number: index + 1,
      name: stepName(step, language, t),
    }));
  const all = screens.flatMap((screen) => screen.rows);
  const askedCount = all.filter((row) => row.asking !== 'not-asked').length;
  const open = screens.find((screen) => screen.step.key === openKey) ?? null;

  /** Ask every question of a screen again (Auto), or skip each one that may be skipped. */
  function setScreen(screen: ScreenView, isAsked: boolean) {
    let nextStates = states;
    let nextCustom = customStates;
    for (const row of screen.rows) {
      const state: IntakeQuestionState = isAsked ? 'auto' : row.canSkip ? 'skip' : row.state;
      if (row.kind === 'builtin') {
        nextStates = withState(nextStates, row.key as IntakeQuestion, state);
      } else {
        nextCustom = withCustomState(nextCustom, row.key, state);
      }
    }
    onChange(nextStates);
    onCustomChange(nextCustom);
  }

  /** A preset fills every choice: the app's questions from it, Ramassà's Ask or Auto. */
  function applyPreset(next: QuestionStates, askAll: boolean) {
    onChange(next);
    onCustomChange(
      askAll
        ? Object.fromEntries(
            screens.flatMap((screen) =>
              screen.rows
                .filter((row) => row.kind === 'custom')
                .map((row) => [row.key, 'ask' as const]),
            ),
          )
        : {},
    );
  }

  return (
    <section
      aria-labelledby="invite-questions-title"
      className="flex flex-col gap-6"
      data-testid="invite-questions-review"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="invite-questions-title" className="text-start text-lg font-semibold">
            {t('participants:inviteQuestionsTitle')}
          </h2>
          <p aria-live="polite" className="text-start text-sm text-muted-foreground">
            {t('participants:inviteQuestionsSummary', { asked: askedCount, total: all.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset(INTAKE_STATE_PRESETS.missing, false)}
          >
            {t('participants:questionStatesPresetMissing')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset(INTAKE_STATE_PRESETS.review, true)}
          >
            {t('participants:questionStatesPresetReview')}
          </Button>
          {catalog.presets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset.states as QuestionStates, false)}
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </header>

      <ol className={BOARD_GRID} aria-label={t('settings:onboardingBoard.listLabel')}>
        {screens.map((screen) => (
          <li
            key={screen.step.key}
            className="flex"
            data-testid={`invite-screen-${screen.step.key}`}
          >
            <InviteScreenCard
              screen={screen}
              catalog={catalog}
              language={language}
              onOpen={() => setOpenKey(screen.step.key)}
              onSwitch={(isAsked) => setScreen(screen, isAsked)}
            />
          </li>
        ))}
      </ol>

      <Sheet open={open !== null} onOpenChange={(isOpen) => (isOpen ? null : setOpenKey(null))}>
        <SheetContent className="w-full gap-0 sm:max-w-lg" data-testid="invite-screen-sheet">
          {open === null ? null : (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{open.name}</SheetTitle>
                <SheetDescription className="sr-only">
                  {t('participants:inviteScreenQuestions')}
                </SheetDescription>
              </SheetHeader>
              <ul className="flex flex-col divide-y overflow-y-auto px-4">
                {open.rows.map((row) => (
                  <QuestionChoice key={row.key} row={row} />
                ))}
              </ul>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function InviteScreenCard({
  screen,
  catalog,
  language,
  onOpen,
  onSwitch,
}: {
  readonly screen: ScreenView;
  readonly catalog: IntakeCatalog;
  readonly language: LanguageCode;
  readonly onOpen: () => void;
  readonly onSwitch: (isAsked: boolean) => void;
}) {
  const { t } = useTranslation(['participants', 'settings', 'onboarding']);
  const { step, rows, name, number } = screen;
  const isLocked = step.kind === 'locked';
  const asked = rows.filter((row) => row.asking !== 'not-asked');
  const isSkipped = rows.length > 0 && rows.every((row) => row.state === 'skip');
  // A required question nobody answered keeps the screen: it cannot be skipped.
  const keeps = rows.some((row) => !row.canSkip);
  const status = isSkipped
    ? t('participants:inviteScreenSkipped')
    : !isLocked && asked.length === 0
      ? t('participants:inviteScreenNotAsked')
      : null;
  const content = stepContent(catalog, step, language, t, {
    ...(isLocked ? {} : { questions: asked.map((row) => row.phone) }),
  });
  const switchId = `invite-screen-switch-${step.key}`;
  return (
    <CardFrame className={cn('bg-card', isLocked && 'bg-muted/40')}>
      <header className="flex h-7 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground tabular-nums">
          {t('settings:onboardingBoard.step', { number })}
          {status === null ? null : (
            <span className="inline-flex min-w-0 items-center gap-1 font-normal">
              <EyeOff aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{status}</span>
            </span>
          )}
        </span>
        {isLocked ? (
          <span
            className="flex size-7 items-center justify-center text-muted-foreground"
            title={t('settings:onboardingBoard.fixed')}
          >
            <Lock aria-hidden className="size-4" />
            <span className="sr-only">{t('settings:onboardingBoard.fixed')}</span>
          </span>
        ) : (
          <span
            className="flex size-7 items-center justify-center"
            title={keeps ? t('participants:inviteScreenRequired') : undefined}
          >
            <Switch
              id={switchId}
              size="sm"
              checked={!isSkipped}
              disabled={keeps}
              onCheckedChange={onSwitch}
              aria-label={t('participants:inviteScreenAsk', { screen: name })}
              aria-describedby={keeps ? `${switchId}-reason` : undefined}
              data-testid={switchId}
            />
            {keeps ? (
              <span id={`${switchId}-reason`} className="sr-only">
                {t('participants:inviteScreenRequired')}
              </span>
            ) : null}
          </span>
        )}
      </header>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={isLocked}
        onClick={onOpen}
        className="block rounded-xl text-start"
      >
        <PhoneMiniature content={content} language={language} isDimmed={status !== null} />
      </button>
      {isLocked ? (
        <span className="flex h-7 items-center justify-center text-xs text-muted-foreground">
          {t('settings:onboardingBoard.fixed')}
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onOpen}
          aria-label={`${t('participants:inviteScreenQuestions')}: ${name}`}
          data-testid={`invite-screen-open-${step.key}`}
        >
          {t('participants:inviteScreenQuestions')}
        </Button>
      )}
    </CardFrame>
  );
}

function QuestionChoice({ row }: { readonly row: QuestionRow }) {
  const { t } = useTranslation('participants');
  const id = `invite-question-${row.key}`;
  return (
    <li
      className="flex flex-col gap-2 py-4"
      data-testid={id}
      data-asking={row.asking}
      data-state={row.state}
    >
      <div className="flex flex-col gap-0.5">
        <p id={`${id}-label`} className="text-start text-sm font-medium">
          {row.label}
          {row.phone.isRequired ? <span className="text-primary"> *</span> : null}
        </p>
        <p className="text-start text-xs text-muted-foreground">
          {t(ASKING_LABEL_KEYS[row.asking])}
        </p>
      </div>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={row.state}
        onValueChange={(next) => {
          // Pressing the chosen one again keeps it.
          if (next !== '') row.set(next as IntakeQuestionState);
        }}
        aria-labelledby={`${id}-label`}
        className="w-fit"
      >
        {(['auto', 'ask', 'skip'] as const).map((state) => (
          <ToggleGroupItem
            key={state}
            value={state}
            disabled={state === 'skip' && !row.canSkip}
            className="px-3 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
            data-testid={`${id}-${state}`}
          >
            {t(CHOICE_LABEL_KEYS[state])}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {row.canSkip ? null : (
        <p className="text-start text-xs text-muted-foreground">
          {t('participants:questionStatesRequiredHint')}
        </p>
      )}
    </li>
  );
}
