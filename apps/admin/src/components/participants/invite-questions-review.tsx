/**
 * The last step of creating a participant (RAPP-618): what her guided
 * registration will ask when she opens the app, worked out from what staff
 * just entered, before the invitation exists.
 *
 * Each question shows whether she is asked, computed with the same shared
 * function her phone plans with (`previewWizardQuestions`), and staff change it
 * with the RAPP-301 choices: Auto, Ask or Don't ask. Don't ask is not offered on
 * a required question nobody answered, and says why. The presets fill every
 * choice at once. The organization's own questions are listed too: she answers
 * them herself, so they are always asked.
 */

import { Button } from '@/components/ui/button';
import { QUESTION_LABEL_KEYS } from '@/lib/builtin-questions';
import { useTranslation } from 'react-i18next';
import {
  INTAKE_STATE_PRESETS,
  previewWizardQuestions,
  type AnsweredQuestions,
  type IntakeQuestion,
  type IntakeQuestionState,
  type QuestionStates,
  type WizardQuestionAsking,
} from '@ramassa/shared/intake';
import {
  builtinLabel,
  hiddenBuiltinQuestions,
  isScreenAnswered,
  requiredBuiltinQuestions,
  textIn,
  wizardFlow,
  wizardScreensInFlowOrder,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** What her phone does with the question, in words staff read. */
const ASKING_LABEL_KEYS: Readonly<Record<WizardQuestionAsking, string>> = {
  asked: 'participants:inviteQuestionAsked',
  'when-it-applies': 'participants:inviteQuestionAskedWhenItApplies',
  'not-asked': 'participants:inviteQuestionNotAsked',
};

const STATE_LABEL_KEYS: Readonly<Record<IntakeQuestionState, string>> = {
  auto: 'participants:questionStateAuto',
  ask: 'participants:questionStateAsk',
  skip: 'participants:questionStateSkip',
};

export interface InviteQuestionsReviewProps {
  /** What the invitation will record as answered. */
  readonly answered: AnsweredQuestions;
  readonly states: QuestionStates;
  readonly onChange: (next: QuestionStates) => void;
  readonly catalog: IntakeCatalog;
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

export function InviteQuestionsReview({
  answered,
  states,
  onChange,
  catalog,
}: InviteQuestionsReviewProps) {
  const { t, i18n } = useTranslation(['participants', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const rows = previewWizardQuestions(
    answered,
    states,
    hiddenBuiltinQuestions(catalog),
    // In the order her screens come, as staff arranged them (RAPP-612).
    wizardFlow(catalog),
    // The organization's required list (RAPP-611), as her phone reads it.
    requiredBuiltinQuestions(catalog),
  );
  // Her answers to the organization's questions are empty when she is created.
  // In the order her phone shows them (RAPP-612), never the catalog's anchor order.
  const customScreens = wizardScreensInFlowOrder(catalog).filter(
    (screen) => !isScreenAnswered(screen, {}),
  );
  const customCount = customScreens.reduce((total, screen) => total + screen.questions.length, 0);
  const askedCount = rows.filter((row) => row.isAsked).length + customCount;

  return (
    <section
      aria-labelledby="invite-questions-title"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="invite-questions-review"
    >
      <div className="flex flex-col gap-1">
        <h2 id="invite-questions-title" className="text-start text-lg font-semibold">
          {t('participants:inviteQuestionsTitle')}
        </h2>
        <p className="text-start text-sm text-muted-foreground">
          {t('participants:inviteQuestionsIntro')}
        </p>
        <p aria-live="polite" className="text-start text-sm font-medium">
          {t('participants:inviteQuestionsSummary', {
            asked: askedCount,
            total: rows.length + customCount,
          })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(INTAKE_STATE_PRESETS.missing)}
        >
          {t('participants:questionStatesPresetMissing')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(INTAKE_STATE_PRESETS.review)}
        >
          {t('participants:questionStatesPresetReview')}
        </Button>
        {catalog.presets.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            variant="outline"
            onClick={() => onChange(preset.states as QuestionStates)}
          >
            {preset.name}
          </Button>
        ))}
      </div>
      <ul className="flex flex-col divide-y">
        {rows.map((row) => {
          const id = `invite-question-${row.question}`;
          const label =
            builtinLabel(catalog, row.question, language) ??
            t(QUESTION_LABEL_KEYS[row.question] ?? row.question);
          // A preset may hold Don't ask on a question it is not allowed for:
          // the box shows Auto, which is what will be saved.
          const shown = row.state === 'skip' && !row.canSkip ? 'auto' : row.state;
          return (
            <li
              key={row.question}
              className="grid gap-2 py-3 sm:grid-cols-[1fr_12rem] sm:items-center"
              data-testid={id}
              data-asked={row.isAsked ? 'true' : 'false'}
              data-asking={row.asking}
            >
              <div className="flex flex-col gap-0.5">
                <label htmlFor={id} className="text-start text-sm font-medium">
                  {label}
                </label>
                <p className="text-start text-xs text-muted-foreground">
                  {t(ASKING_LABEL_KEYS[row.asking])}
                  {' · '}
                  {row.isAnswered
                    ? t('participants:questionStatesAnswered')
                    : t('participants:questionStatesUnanswered')}
                </p>
                {row.isRemoved ? (
                  <p className="text-start text-xs text-muted-foreground">
                    {t('participants:inviteQuestionRemoved')}
                  </p>
                ) : null}
                {row.canSkip ? null : (
                  <p id={`${id}-hint`} className="text-start text-xs text-muted-foreground">
                    {t('participants:questionStatesRequiredHint')}
                  </p>
                )}
              </div>
              <select
                id={id}
                value={shown}
                disabled={row.isRemoved}
                aria-describedby={row.canSkip ? undefined : `${id}-hint`}
                onChange={(event) =>
                  onChange(
                    withState(states, row.question, event.target.value as IntakeQuestionState),
                  )
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {(['auto', 'ask', 'skip'] as const).map((state) => (
                  <option key={state} value={state} disabled={state === 'skip' && !row.canSkip}>
                    {t(STATE_LABEL_KEYS[state])}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      {customScreens.length === 0 ? null : (
        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-start text-base font-semibold">
            {t('participants:inviteQuestionsCustomTitle')}
          </h3>
          <p className="text-start text-sm text-muted-foreground">
            {t('participants:inviteQuestionsCustomHint')}
          </p>
          <ul className="flex flex-col gap-1">
            {customScreens.flatMap((screen) =>
              screen.questions.map((question) => (
                <li
                  key={question.id}
                  className="flex flex-wrap justify-between gap-2 text-sm"
                  data-testid={`invite-custom-question-${question.id}`}
                >
                  <span className="text-start">
                    {textIn(screen.title, language)}: {textIn(question.label, language)}
                  </span>
                  <span className="text-start text-muted-foreground">
                    {question.showWhen === undefined
                      ? t('participants:inviteQuestionAsked')
                      : t('participants:inviteQuestionAskedWhenItApplies')}
                  </span>
                </li>
              )),
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
