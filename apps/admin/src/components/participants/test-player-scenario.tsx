/**
 * Scenario switches on a test player (RAPP-619). The person designing the
 * onboarding sets the situation of a made-up woman, then opens the app as her:
 *   - which wizard questions she already has answered (a fixed sample answer
 *     in her language, recorded as a staff answer, or nothing);
 *   - whether she accepted the app terms (joined) or goes through the
 *     onboarding again;
 *   - whether she signed this season's authorization;
 *   - whether she is a new player or returns from an earlier season;
 *   - which staff questions she answered, every type of question included
 *     (RAPP-610: a sample file in her own folder, a sample signature);
 *   - and a reset to a brand-new invited player.
 * Only on a test player: the page shows it for no one else, and the database
 * refuses every switch on a real woman.
 */

import { Button } from '@/components/ui/button';
import { QUESTION_LABEL_KEYS } from '@/lib/builtin-questions';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WIZARD_QUESTIONS, type IntakeQuestion } from '@ramassa/shared/intake';
import { textIn, type CustomQuestion } from '@ramassa/shared/intake-builder';
import {
  sampleAnswerPayload,
  sampleAnswersFor,
  sampleCustomAnswersFor,
  type TestPlayerScenario,
  type TestPlayerScenarioChange,
} from '@ramassa/shared/participants';

/** Fill all also answers her language, which the wizard asks before its screens. */
const FILL_ALL_QUESTIONS: readonly IntakeQuestion[] = [...WIZARD_QUESTIONS, 'preferred_language'];

const REQUIRED_ANSWERS_REFUSAL = 'fill her required answers';
const JOINED_REFUSAL = 'she has joined';
const NO_SEASON_REFUSAL = 'no current season';

export function TestPlayerScenarioPanel({
  scenario,
  onChange,
  customQuestions = [],
  owner,
}: {
  readonly scenario: TestPlayerScenario;
  /** One switch, one database call. Throws when refused. */
  readonly onChange: (change: TestPlayerScenarioChange) => Promise<void>;
  /** The staff questions her wizard or season asks (RAPP-610). */
  readonly customQuestions?: readonly CustomQuestion[];
  /** Her organization and id: a sample file lives in her own private folder. */
  readonly owner?: { readonly orgId: string; readonly profileId: string };
}) {
  const { t } = useTranslation(['participants', 'onboarding', 'settings']);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const language = scenario.language;

  async function apply(change: TestPlayerScenarioChange) {
    setWorking(true);
    setErrorMessage(null);
    try {
      await onChange(change);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setErrorMessage(
        message.includes(REQUIRED_ANSWERS_REFUSAL)
          ? t('testScenarioNeedsRequiredAnswers')
          : message.includes(JOINED_REFUSAL)
            ? t('testScenarioJoinedKeepsRequired')
            : message.includes(NO_SEASON_REFUSAL)
              ? t('testScenarioNoSeason')
              : t('testScenarioFailed'),
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      aria-labelledby="test-scenario-title"
      className="flex flex-col gap-5 rounded-xl border bg-card p-5"
      data-testid="test-player-scenario"
    >
      <div className="flex flex-col gap-1">
        <h2 id="test-scenario-title" className="text-start text-lg font-semibold">
          {t('testScenarioTitle')}
        </h2>
        <p className="text-start text-sm text-muted-foreground">{t('testScenarioIntro')}</p>
      </div>

      {scenario.termsDraft || scenario.authorizationDraft ? (
        <div
          className="flex flex-col gap-1 rounded-lg border border-dashed p-3"
          data-testid="test-scenario-draft-note"
          role="note"
        >
          <p className="text-start text-sm font-medium">{t('settings:draftSeenByTestPlayers')}</p>
          {scenario.termsDraft ? (
            <p
              className="text-start text-sm text-muted-foreground"
              data-testid="test-scenario-draft-terms"
            >
              {t('testScenarioDraftTerms')}
            </p>
          ) : null}
          {scenario.authorizationDraft ? (
            <p
              className="text-start text-sm text-muted-foreground"
              data-testid="test-scenario-draft-authorization"
            >
              {t('testScenarioDraftAuthorization')}
            </p>
          ) : null}
        </div>
      ) : null}

      <ScenarioRow
        testId="test-scenario-terms"
        title={t('testScenarioTermsTitle')}
        state={scenario.termsAccepted ? t('testScenarioTermsAccepted') : t('testScenarioTermsNot')}
        action={
          scenario.termsAccepted
            ? t('testScenarioTermsUnsetAction')
            : t('testScenarioTermsSetAction')
        }
        disabled={working}
        onPress={() =>
          // The database accepts the current app terms version (RAPP-613).
          void apply({ kind: 'terms', accepted: !scenario.termsAccepted })
        }
      />
      <ScenarioRow
        testId="test-scenario-season"
        title={
          scenario.currentSeason === null
            ? t('testScenarioNoSeason')
            : t('testScenarioSeasonTitle', { season: scenario.currentSeason })
        }
        state={
          scenario.signedThisSeason ? t('testScenarioSeasonSigned') : t('testScenarioSeasonNot')
        }
        action={
          scenario.signedThisSeason
            ? t('testScenarioSeasonUnsetAction')
            : t('testScenarioSeasonSetAction')
        }
        disabled={working || scenario.currentSeason === null}
        onPress={() => void apply({ kind: 'season_signature', signed: !scenario.signedThisSeason })}
      />
      <ScenarioRow
        testId="test-scenario-returning"
        title={t('testScenarioReturningTitle')}
        state={scenario.returning ? t('testScenarioReturning') : t('testScenarioNew')}
        action={
          scenario.returning
            ? t('testScenarioReturningUnsetAction')
            : t('testScenarioReturningSetAction')
        }
        disabled={working || scenario.currentSeason === null}
        onPress={() => void apply({ kind: 'returning', returning: !scenario.returning })}
      />

      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-start text-base font-semibold">{t('testScenarioAnswersTitle')}</h3>
          <p className="text-start text-sm text-muted-foreground">
            {t('testScenarioAnswersIntro')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={working}
            onClick={() =>
              void apply({ kind: 'answers', fill: sampleAnswersFor(FILL_ALL_QUESTIONS, language) })
            }
          >
            {t('testScenarioFillAll')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={working}
            // Her app language has no wizard screen: it is never cleared (RAPP-618).
            onClick={() => void apply({ kind: 'answers', clear: WIZARD_QUESTIONS })}
          >
            {t('testScenarioClearAll')}
          </Button>
        </div>
        <ul className="flex flex-col divide-y">
          {WIZARD_QUESTIONS.map((question) => {
            const isAnswered = scenario.answered.has(question);
            return (
              <li
                key={question}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
                data-testid={`test-scenario-answer-${question}`}
                data-answered={isAnswered ? 'true' : 'false'}
              >
                <span className="text-start text-sm">
                  {t(QUESTION_LABEL_KEYS[question] ?? question)}
                  {' · '}
                  <span className="text-muted-foreground">
                    {isAnswered ? t('questionStatesAnswered') : t('questionStatesUnanswered')}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={working}
                  aria-label={
                    isAnswered
                      ? t('testScenarioClearOne', {
                          question: t(QUESTION_LABEL_KEYS[question] ?? question),
                        })
                      : t('testScenarioFillOne', {
                          question: t(QUESTION_LABEL_KEYS[question] ?? question),
                        })
                  }
                  onClick={() =>
                    void apply(
                      isAnswered
                        ? { kind: 'answers', clear: [question] }
                        : { kind: 'answers', fill: sampleAnswerPayload(question, language) },
                    )
                  }
                >
                  {isAnswered ? t('testScenarioClear') : t('testScenarioFill')}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      {customQuestions.length === 0 || owner === undefined ? null : (
        <div className="flex flex-col gap-3 border-t pt-4" data-testid="test-scenario-custom">
          <div className="flex flex-col gap-1">
            <h3 className="text-start text-base font-semibold">{t('testScenarioCustomTitle')}</h3>
            <p className="text-start text-sm text-muted-foreground">
              {t('testScenarioCustomIntro')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() =>
                void apply({
                  kind: 'custom_answers',
                  fill: sampleCustomAnswersFor(customQuestions, language, owner),
                })
              }
            >
              {t('testScenarioFillAllCustom')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() =>
                void apply({
                  kind: 'custom_answers',
                  clear: customQuestions.map((question) => question.id),
                })
              }
            >
              {t('testScenarioClearAllCustom')}
            </Button>
          </div>
          <ul className="flex flex-col divide-y">
            {customQuestions.map((question) => {
              const isAnswered = scenario.customAnswered.has(question.id);
              const label = textIn(question.label, 'ca');
              return (
                <li
                  key={question.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                  data-testid={`test-scenario-custom-${question.id}`}
                  data-answered={isAnswered ? 'true' : 'false'}
                >
                  <span className="text-start text-sm">
                    {label}
                    {' · '}
                    <span className="text-muted-foreground">
                      {t(`settings:questions.types.${question.type}`)}
                      {' · '}
                      {isAnswered ? t('questionStatesAnswered') : t('questionStatesUnanswered')}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={working}
                    aria-label={
                      isAnswered
                        ? t('testScenarioClearOne', { question: label })
                        : t('testScenarioFillOne', { question: label })
                    }
                    onClick={() =>
                      void apply(
                        isAnswered
                          ? { kind: 'custom_answers', clear: [question.id] }
                          : {
                              kind: 'custom_answers',
                              fill: sampleCustomAnswersFor([question], language, owner),
                            },
                      )
                    }
                  >
                    {isAnswered ? t('testScenarioClear') : t('testScenarioFill')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="text-start text-sm text-muted-foreground">{t('testScenarioResetHint')}</p>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={working}
          onClick={() => void apply({ kind: 'reset' })}
        >
          {t('testScenarioReset')}
        </Button>
      </div>
      {errorMessage === null ? null : (
        <p role="alert" className="text-start text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </section>
  );
}

function ScenarioRow({
  testId,
  title,
  state,
  action,
  disabled,
  onPress,
}: {
  readonly testId: string;
  readonly title: string;
  readonly state: string;
  readonly action: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-testid={testId}>
      <div className="flex flex-col gap-0.5">
        <p className="text-start text-sm font-medium">{title}</p>
        <p className="text-start text-sm text-muted-foreground" data-testid={`${testId}-state`}>
          {state}
        </p>
      </div>
      <Button type="button" variant="outline" disabled={disabled} onClick={onPress}>
        {action}
      </Button>
    </div>
  );
}
