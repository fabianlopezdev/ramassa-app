/**
 * The last step of a new invite on the phone (RAPP-618, RAPP-644), as on the
 * Control Center: her screens in the order her phone walks them, planned by
 * the same shared function (`playerPlan`), so both say the same.
 *
 * Laid out as a settings list: one group per screen with its name, how many
 * of its questions she will be asked, and a switch that asks or skips the
 * whole screen. Tapping the name opens the group to its questions, the app's
 * own and Ramassà's in one list, each with Auto, Ask or Don't ask. Don't ask
 * is not offered on a required question nobody answered, and a screen holding
 * one keeps its switch on and says why. The screens that always end the
 * onboarding close the list, locked. The presets fill every choice at once.
 */
import { ChoiceOption } from '@/components/equipment/choice-option';
import { BrandSymbol } from '@/components/forms/data-icon';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, Text, View } from 'react-native';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  INTAKE_QUESTION_LABEL_KEYS,
  type AnsweredQuestions,
  type IntakeQuestionState,
  type QuestionStates,
  type WizardQuestionAsking,
} from '@ramassa/shared/intake';
import {
  builtinLabel,
  flowStepName,
  PLAYER_PRESETS,
  playerPlan,
  presetChoices,
  textIn,
  withQuestionChoice,
  withScreenChoice,
  type IntakeCatalog,
  type PlanQuestion,
  type PlanScreen,
  type PlayerChoices,
} from '@ramassa/shared/intake-builder';
import { tokens } from '@ramassa/shared/tokens';

const trackColor = { false: tokens.colors.neutral[300], true: tokens.colors.primary.DEFAULT };

const ASKING_LABEL_KEYS: Readonly<Record<WizardQuestionAsking, string>> = {
  asked: 'inviteQuestionAsked',
  'when-it-applies': 'inviteQuestionAskedWhenItApplies',
  'not-asked': 'inviteQuestionNotAsked',
};

const CHOICE_LABEL_KEYS: Readonly<Record<IntakeQuestionState, string>> = {
  auto: 'inviteChoiceAuto',
  ask: 'inviteChoiceAsk',
  skip: 'inviteChoiceSkip',
};

const chevron = {
  down: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  up: { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' },
  lock: { ios: 'lock', android: 'lock', web: 'lock' },
} as const;

export function InviteQuestionsStep({
  answered,
  choices,
  onChange,
  catalog,
}: {
  readonly answered: AnsweredQuestions;
  readonly choices: PlayerChoices;
  readonly onChange: (next: PlayerChoices) => void;
  readonly catalog: IntakeCatalog;
}) {
  const { t } = useTranslation(['participants', 'settings', 'onboarding']);
  const fontClass = useLanguageFontClass();
  const { language } = useLanguage();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const plan = playerPlan(catalog, answered, choices);
  const movable = plan.screens.filter((screen) => screen.step.kind !== 'locked');
  const locked = plan.screens.filter((screen) => screen.step.kind === 'locked');
  const presets: readonly {
    readonly id: string;
    readonly name: string;
    readonly apply: () => PlayerChoices;
  }[] = [
    {
      id: 'missing',
      name: t('questionStatesPresetMissing'),
      apply: () => PLAYER_PRESETS.missing(catalog),
    },
    {
      id: 'review',
      name: t('questionStatesPresetReview'),
      apply: () => PLAYER_PRESETS.review(catalog),
    },
    ...catalog.presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      apply: () => presetChoices(catalog, preset.states as QuestionStates, false),
    })),
  ];

  return (
    <View className="gap-md" testID="invite-questions-step">
      <Text
        accessibilityLiveRegion="polite"
        className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}
      >
        {t('inviteQuestionsSummary', { asked: plan.askedCount, total: plan.total })}
      </Text>
      <View className="flex-row flex-wrap gap-sm">
        {presets.map((preset) => (
          <ChoiceOption
            key={preset.id}
            testID={`invite-questions-preset-${preset.id}`}
            value={preset.id}
            label={preset.name}
            selected={false}
            onSelect={() => onChange(preset.apply())}
            languageFontClass={fontClass}
          />
        ))}
      </View>
      {movable.map((screen) => (
        <ScreenGroup
          key={screen.step.key}
          screen={screen}
          name={flowStepName(screen.step, language, t)}
          catalog={catalog}
          isOpen={openKey === screen.step.key}
          onToggleOpen={() =>
            setOpenKey((current) => (current === screen.step.key ? null : screen.step.key))
          }
          onSwitch={(isAsked) => onChange(withScreenChoice(choices, screen, isAsked))}
          onChoice={(question, state) => onChange(withQuestionChoice(choices, question, state))}
        />
      ))}
      {locked.length === 0 ? null : (
        <View
          className="rounded-md border border-neutral-200 bg-neutral-50"
          testID="invite-screens-locked"
        >
          <Text
            accessibilityRole="header"
            className={`px-md pt-md text-start text-sm font-semibold text-neutral-600 ${fontClass}`}
          >
            {t('settings:onboardingBoard.fixed')}
          </Text>
          {locked.map((screen) => (
            <View
              key={screen.step.key}
              className="min-h-recommended flex-row items-center gap-sm px-md"
              testID={`invite-screen-${screen.step.key}`}
            >
              <BrandSymbol name={chevron.lock} size={tokens.spacing.md} />
              <Text className={`flex-1 text-start text-md text-neutral-800 ${fontClass}`}>
                {flowStepName(screen.step, language, t)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ScreenGroup({
  screen,
  name,
  catalog,
  isOpen,
  onToggleOpen,
  onSwitch,
  onChoice,
}: {
  readonly screen: PlanScreen;
  readonly name: string;
  readonly catalog: IntakeCatalog;
  readonly isOpen: boolean;
  readonly onToggleOpen: () => void;
  readonly onSwitch: (isAsked: boolean) => void;
  readonly onChoice: (question: PlanQuestion, state: IntakeQuestionState) => void;
}) {
  const { t } = useTranslation(['participants', 'onboarding']);
  const fontClass = useLanguageFontClass();
  const { language } = useLanguage();
  const { step, questions, isSkipped, mustAsk, askedCount } = screen;
  const subtitle = isSkipped
    ? t('inviteScreenSkipped')
    : askedCount === 0
      ? t('inviteScreenNotAsked')
      : t('inviteScreenCount', { asked: askedCount, total: questions.length });
  const labelOf = (question: PlanQuestion): string =>
    question.kind === 'builtin'
      ? (builtinLabel(catalog, question.question, language) ??
        t(INTAKE_QUESTION_LABEL_KEYS[question.question] ?? question.question))
      : textIn(question.question.label, language);

  return (
    <View
      className={`rounded-md border border-neutral-200 ${isSkipped ? 'bg-neutral-50' : 'bg-white'}`}
      testID={`invite-screen-${step.key}`}
    >
      <View className="flex-row items-center gap-sm pe-md">
        <Pressable
          testID={`invite-screen-open-${step.key}`}
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${subtitle}`}
          accessibilityHint={t('inviteScreenQuestions')}
          accessibilityState={{ expanded: isOpen }}
          onPress={() => {
            playHaptic('selection');
            onToggleOpen();
          }}
          className="min-h-recommended flex-1 flex-row items-center gap-sm py-sm ps-md active:opacity-80"
        >
          <View className="flex-1 gap-xs">
            <Text
              className={`text-start text-md font-semibold ${isSkipped ? 'text-neutral-600' : 'text-neutral-900'} ${fontClass}`}
            >
              {name}
            </Text>
            <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{subtitle}</Text>
          </View>
          <BrandSymbol name={isOpen ? chevron.up : chevron.down} size={tokens.spacing.md} />
        </Pressable>
        <Switch
          testID={`invite-screen-switch-${step.key}`}
          accessibilityLabel={t('inviteScreenAsk', { screen: name })}
          accessibilityHint={mustAsk ? t('inviteScreenRequired') : undefined}
          value={!isSkipped}
          disabled={mustAsk}
          onValueChange={onSwitch}
          trackColor={trackColor}
        />
      </View>
      {mustAsk ? (
        <Text className={`px-md pb-sm text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('inviteScreenRequired')}
        </Text>
      ) : null}
      {isOpen ? (
        <View className="border-t border-neutral-200">
          {questions.map((question, index) => (
            <View
              key={question.key}
              className={`gap-xs p-md ${index === 0 ? '' : 'border-t border-neutral-100'}`}
              testID={`invite-question-${question.key}`}
            >
              <Text className={`text-start text-md font-medium text-neutral-900 ${fontClass}`}>
                {labelOf(question)}
                {question.isRequired ? <Text className="text-primary"> *</Text> : null}
              </Text>
              <Text
                testID={`invite-question-${question.key}-status`}
                className={`text-start text-sm text-neutral-600 ${fontClass}`}
              >
                {t(ASKING_LABEL_KEYS[question.asking])}
                {' · '}
                {question.isAnswered ? t('questionStatesAnswered') : t('questionStatesUnanswered')}
              </Text>
              <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-sm pt-xs">
                {(question.canSkip
                  ? (['auto', 'ask', 'skip'] as const)
                  : (['auto', 'ask'] as const)
                ).map((state) => (
                  <ChoiceOption
                    key={state}
                    testID={`invite-question-${question.key}-${state}`}
                    value={state}
                    label={t(CHOICE_LABEL_KEYS[state])}
                    selected={question.state === state}
                    onSelect={(next) => onChoice(question, next)}
                    languageFontClass={fontClass}
                  />
                ))}
              </View>
              {question.canSkip ? null : (
                <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                  {t('questionStatesRequiredHint')}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
