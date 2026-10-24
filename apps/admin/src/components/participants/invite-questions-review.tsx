/**
 * One player's copy of the Onboarding board (RAPP-643, RAPP-645). The board is
 * the template; here staff decide what this one player is asked: as the last
 * step of creating her, and on her page until she joins.
 *
 * Each screen her plan can show is a card, in her order, with the board's
 * phone miniature drawn from her choices. A card's switch asks or skips the
 * whole screen: skipping sets each of its questions to Don't ask. Opening a
 * card lists its questions, the app's own and Ramassà's in one list, each with
 * Auto, Ask or Don't ask (RAPP-301) and whether it is answered. Don't ask is
 * not offered on a required question nobody answered, and a screen holding
 * one cannot be skipped. The summary, the terms and the authorization always
 * end it, locked.
 *
 * The plan is shared (`playerPlan`), so this page, the staff phone and her
 * phone agree. The presets fill every choice at once.
 */

import { PhoneMiniature } from '@/components/onboarding/phone-preview';
import { BOARD_GRID, CardFrame, stepName } from '@/components/onboarding/screen-board';
import {
  builtinPhoneQuestion,
  customPhoneQuestion,
  stepContent,
} from '@/components/onboarding/screen-content';
import { CHOICE_LABEL_KEYS } from '@/components/participants/choice-menu';
import { PlayerChoicePresets } from '@/components/participants/player-choice-presets';
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
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AnsweredQuestions,
  IntakeQuestionState,
  QuestionStates,
  WizardQuestionAsking,
} from '@ramassa/shared/intake';
import {
  builtinLabel,
  playerPlan,
  textIn,
  withQuestionChoice,
  withScreenChoice,
  type CustomAnswers,
  type CustomQuestionStates,
  type IntakeCatalog,
  type IntakePreset,
  type PlanQuestion,
  type PlanScreen,
  type PlayerChoices,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

const ASKING_LABEL_KEYS: Readonly<Record<WizardQuestionAsking, string>> = {
  asked: 'participants:inviteQuestionAsked',
  'when-it-applies': 'participants:inviteQuestionAskedWhenItApplies',
  'not-asked': 'participants:inviteQuestionNotAsked',
};

interface PlayerQuestionsBoardProps {
  readonly catalog: IntakeCatalog;
  /** What is recorded as answered on her profile. */
  readonly answered: AnsweredQuestions;
  /** Her answers to Ramassà's questions; none for a player not created yet. */
  readonly customAnswers?: CustomAnswers;
  readonly choices: PlayerChoices;
  readonly onChange: (next: PlayerChoices) => void;
  /** An organization preset can be deleted here (her page). */
  readonly onDeletePreset?: (preset: IntakePreset) => void;
  /** Under the cards: her page's Save, for example. */
  readonly footer?: ReactNode;
  readonly testId?: string;
}

/** Her screens as cards, with the count, the presets and a sheet per screen. */
function PlayerQuestionsBoard({
  catalog,
  answered,
  customAnswers = {},
  choices,
  onChange,
  onDeletePreset,
  footer,
  testId = 'player-questions',
}: PlayerQuestionsBoardProps) {
  const { t, i18n } = useTranslation(['participants', 'settings', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const plan = playerPlan(catalog, answered, choices, customAnswers);
  const open = plan.screens.find((screen) => screen.step.key === openKey) ?? null;
  const labelOf = (question: PlanQuestion): string =>
    question.kind === 'builtin'
      ? (builtinLabel(catalog, question.question, language) ??
        t(QUESTION_LABEL_KEYS[question.question] ?? question.question))
      : textIn(question.question.label, language);

  return (
    <section
      aria-labelledby={`${testId}-title`}
      className="flex flex-col gap-6"
      data-testid={testId}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`${testId}-title`} className="text-start text-lg font-semibold">
            {t('participants:inviteQuestionsTitle')}
          </h2>
          <p aria-live="polite" className="text-start text-sm text-muted-foreground">
            {t('participants:inviteQuestionsSummary', {
              asked: plan.askedCount,
              total: plan.total,
            })}
          </p>
        </div>
        <PlayerChoicePresets
          catalog={catalog}
          onChange={onChange}
          onDeletePreset={onDeletePreset}
        />
      </header>

      <ol className={BOARD_GRID} aria-label={t('settings:onboardingBoard.listLabel')}>
        {plan.screens.map((screen) => (
          <li
            key={screen.step.key}
            className="flex"
            data-testid={`invite-screen-${screen.step.key}`}
          >
            <PlayerScreenCard
              screen={screen}
              catalog={catalog}
              language={language}
              onOpen={() => setOpenKey(screen.step.key)}
              onSwitch={(isAsked) => onChange(withScreenChoice(choices, screen, isAsked))}
            />
          </li>
        ))}
      </ol>

      {footer}

      <Sheet open={open !== null} onOpenChange={(isOpen) => (isOpen ? null : setOpenKey(null))}>
        <SheetContent className="w-full gap-0 sm:max-w-lg" data-testid="invite-screen-sheet">
          {open === null ? null : (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{stepName(open.step, language, t)}</SheetTitle>
                <SheetDescription className="sr-only">
                  {t('participants:inviteScreenQuestions')}
                </SheetDescription>
              </SheetHeader>
              <ul className="flex flex-col divide-y overflow-y-auto px-4">
                {open.questions.map((question) => (
                  <QuestionChoice
                    key={question.key}
                    question={question}
                    label={labelOf(question)}
                    onChange={(state) => onChange(withQuestionChoice(choices, question, state))}
                  />
                ))}
              </ul>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export interface InviteQuestionsReviewProps {
  /** What the invitation will record as answered. */
  readonly answered: AnsweredQuestions;
  readonly states: QuestionStates;
  readonly onChange: (next: QuestionStates) => void;
  /** Her choices on Ramassà's own questions (RAPP-643); none means Auto on each. */
  readonly customStates?: CustomQuestionStates;
  readonly onCustomChange?: (next: CustomQuestionStates) => void;
  /** The Fitxa fields an entity already answered (RAPP-652): Auto skips them. */
  readonly customAnswers?: CustomAnswers;
  readonly catalog: IntakeCatalog;
}

/** The last step of creating a participant (RAPP-618, RAPP-643). */
export function InviteQuestionsReview({
  answered,
  states,
  onChange,
  customStates = {},
  onCustomChange = () => undefined,
  customAnswers = {},
  catalog,
}: InviteQuestionsReviewProps) {
  return (
    <PlayerQuestionsBoard
      catalog={catalog}
      answered={answered}
      customAnswers={customAnswers}
      choices={{ states, customStates }}
      onChange={(next) => {
        onChange(next.states);
        onCustomChange(next.customStates);
      }}
      testId="invite-questions-review"
    />
  );
}

function PlayerScreenCard({
  screen,
  catalog,
  language,
  onOpen,
  onSwitch,
}: {
  readonly screen: PlanScreen;
  readonly catalog: IntakeCatalog;
  readonly language: LanguageCode;
  readonly onOpen: () => void;
  readonly onSwitch: (isAsked: boolean) => void;
}) {
  const { t } = useTranslation(['participants', 'settings', 'onboarding']);
  const { step, questions, number, isSkipped, mustAsk, askedCount } = screen;
  const isLocked = step.kind === 'locked';
  const name = stepName(step, language, t);
  const status = isSkipped
    ? t('participants:inviteScreenSkipped')
    : !isLocked && askedCount === 0
      ? t('participants:inviteScreenNotAsked')
      : null;
  // The miniature draws only what she will be asked.
  const content = stepContent(catalog, step, language, t, {
    ...(isLocked
      ? {}
      : {
          questions: questions
            .filter((question) => question.asking !== 'not-asked')
            .map((question) =>
              question.kind === 'builtin'
                ? builtinPhoneQuestion(catalog, question.question, language, t)
                : customPhoneQuestion(question.question, language),
            ),
        }),
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
            title={mustAsk ? t('participants:inviteScreenRequired') : undefined}
          >
            <Switch
              id={switchId}
              size="sm"
              checked={!isSkipped}
              disabled={mustAsk}
              onCheckedChange={onSwitch}
              aria-label={t('participants:inviteScreenAsk', { screen: name })}
              aria-describedby={mustAsk ? `${switchId}-reason` : undefined}
              data-testid={switchId}
            />
            {mustAsk ? (
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

function QuestionChoice({
  question,
  label,
  onChange,
}: {
  readonly question: PlanQuestion;
  readonly label: string;
  readonly onChange: (state: IntakeQuestionState) => void;
}) {
  const { t } = useTranslation('participants');
  const id = `invite-question-${question.key}`;
  return (
    <li
      className="flex flex-col gap-2 py-4"
      data-testid={id}
      data-asking={question.asking}
      data-state={question.state}
    >
      <div className="flex flex-col gap-0.5">
        <p id={`${id}-label`} className="text-start text-sm font-medium">
          {label}
          {question.isRequired ? <span className="text-primary"> *</span> : null}
        </p>
        <p className="text-start text-xs text-muted-foreground">
          {t(ASKING_LABEL_KEYS[question.asking])}
          {' · '}
          {question.isAnswered
            ? t('participants:questionStatesAnswered')
            : t('participants:questionStatesUnanswered')}
        </p>
      </div>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={question.state}
        onValueChange={(next) => {
          // Pressing the chosen one again keeps it.
          if (next !== '') onChange(next as IntakeQuestionState);
        }}
        aria-labelledby={`${id}-label`}
        className="w-fit"
      >
        {(['auto', 'ask', 'skip'] as const).map((state) => (
          <ToggleGroupItem
            key={state}
            value={state}
            disabled={state === 'skip' && !question.canSkip}
            className="px-3 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
            data-testid={`${id}-${state}`}
          >
            {t(CHOICE_LABEL_KEYS[state])}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {question.canSkip ? null : (
        <p className="text-start text-xs text-muted-foreground">
          {t('participants:questionStatesRequiredHint')}
        </p>
      )}
    </li>
  );
}
