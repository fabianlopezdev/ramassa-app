/**
 * The last step of a new invite on the phone (RAPP-618), as on the web admin:
 * what her guided registration will ask when she opens the app, from what
 * staff just entered, decided by the same shared function her own phone plans
 * with (`previewWizardQuestions`). Staff change single questions with the
 * RAPP-301 choices, Auto, Ask or Don't ask, or apply a preset. Don't ask is not
 * offered on a required question nobody answered, and the screen says why.
 */
import { ChoiceOption } from '@/components/equipment/choice-option';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  INTAKE_QUESTION_LABEL_KEYS,
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
  textIn,
  wizardFlow,
  wizardScreens,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';

/** What her phone does with the question, in words staff read. */
const ASKING_LABEL_KEYS: Readonly<Record<WizardQuestionAsking, string>> = {
  asked: 'inviteQuestionAsked',
  'when-it-applies': 'inviteQuestionAskedWhenItApplies',
  'not-asked': 'inviteQuestionNotAsked',
};

const STATE_LABEL_KEYS: Readonly<Record<IntakeQuestionState, string>> = {
  auto: 'questionStateAuto',
  ask: 'questionStateAsk',
  skip: 'questionStateSkip',
};

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

export function InviteQuestionsStep({
  answered,
  states,
  onChange,
  catalog,
}: {
  readonly answered: AnsweredQuestions;
  readonly states: QuestionStates;
  readonly onChange: (next: QuestionStates) => void;
  readonly catalog: IntakeCatalog;
}) {
  const { t } = useTranslation(['participants', 'onboarding']);
  const fontClass = useLanguageFontClass();
  const { language } = useLanguage();
  const rows = previewWizardQuestions(
    answered,
    states,
    hiddenBuiltinQuestions(catalog),
    // In the order her screens come, as staff arranged them (RAPP-612).
    wizardFlow(catalog),
  );
  const customScreens = wizardScreens(catalog).filter((screen) => !isScreenAnswered(screen, {}));
  const customCount = customScreens.reduce((total, screen) => total + screen.questions.length, 0);
  const presets: readonly {
    readonly id: string;
    readonly name: string;
    readonly states: QuestionStates;
  }[] = [
    { id: 'missing', name: t('questionStatesPresetMissing'), states: INTAKE_STATE_PRESETS.missing },
    { id: 'review', name: t('questionStatesPresetReview'), states: INTAKE_STATE_PRESETS.review },
    ...catalog.presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      states: preset.states as QuestionStates,
    })),
  ];

  return (
    <View className="gap-md" testID="invite-questions-step">
      <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
        {t('inviteQuestionsIntro')}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}
      >
        {t('inviteQuestionsSummary', {
          asked: rows.filter((row) => row.isAsked).length + customCount,
          total: rows.length + customCount,
        })}
      </Text>
      <View className="flex-row flex-wrap gap-sm">
        {presets.map((preset) => (
          <ChoiceOption
            key={preset.id}
            testID={`invite-questions-preset-${preset.id}`}
            value={preset.id}
            label={preset.name}
            selected={false}
            onSelect={() => onChange(preset.states)}
            languageFontClass={fontClass}
          />
        ))}
      </View>
      {rows.map((row) => {
        const label =
          builtinLabel(catalog, row.question, language) ??
          t(INTAKE_QUESTION_LABEL_KEYS[row.question] ?? row.question);
        const choices: readonly IntakeQuestionState[] = row.canSkip
          ? ['auto', 'ask', 'skip']
          : ['auto', 'ask'];
        const shown = row.state === 'skip' && !row.canSkip ? 'auto' : row.state;
        return (
          <View
            key={row.question}
            className="gap-xs border-t border-neutral-200 pt-sm"
            testID={`invite-question-${row.question}`}
          >
            <Text className={`text-start text-md font-medium text-neutral-900 ${fontClass}`}>
              {label}
            </Text>
            <Text
              testID={`invite-question-${row.question}-status`}
              className={`text-start text-sm text-neutral-600 ${fontClass}`}
            >
              {t(ASKING_LABEL_KEYS[row.asking])}
              {' · '}
              {row.isAnswered ? t('questionStatesAnswered') : t('questionStatesUnanswered')}
            </Text>
            {row.isRemoved ? (
              <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                {t('inviteQuestionRemoved')}
              </Text>
            ) : (
              <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-sm">
                {choices.map((state) => (
                  <ChoiceOption
                    key={state}
                    testID={`invite-question-${row.question}-${state}`}
                    value={state}
                    label={t(STATE_LABEL_KEYS[state])}
                    selected={shown === state}
                    onSelect={(next) => onChange(withState(states, row.question, next))}
                    languageFontClass={fontClass}
                  />
                ))}
              </View>
            )}
            {row.canSkip ? null : (
              <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                {t('questionStatesRequiredHint')}
              </Text>
            )}
          </View>
        );
      })}
      {customScreens.length === 0 ? null : (
        <View className="gap-xs border-t border-neutral-200 pt-sm">
          <Text
            accessibilityRole="header"
            className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}
          >
            {t('inviteQuestionsCustomTitle')}
          </Text>
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('inviteQuestionsCustomHint')}
          </Text>
          {customScreens.flatMap((screen) =>
            screen.questions.map((question) => (
              <Text
                key={question.id}
                className={`text-start text-md text-neutral-800 ${fontClass}`}
              >
                {textIn(screen.title, language)}: {textIn(question.label, language)} ·{' '}
                {question.showWhen === undefined
                  ? t('inviteQuestionAsked')
                  : t('inviteQuestionAskedWhenItApplies')}
              </Text>
            )),
          )}
        </View>
      )}
    </View>
  );
}
