import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { FailureNotice } from '@/components/error-code-line';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  useOwnSurveyResponse,
  usePlayerSurveys,
  useSaveSurveyResponse,
} from '@/lib/player-surveys';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  findSurveyResumeIndex,
  resolveSurveyCopy,
  type SurveyAnswer,
  type SurveyQuestion,
} from '@ramassa/shared/surveys';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  selected: { borderColor: tokens.colors.primary.DEFAULT },
  textInput: {
    minHeight: tokens.spacing['3xl'] * 2 + tokens.spacing.md,
    textAlignVertical: 'top',
    writingDirection: 'auto',
  },
  dynamicCopy: { writingDirection: 'auto' },
});
const optionStyle = continuousCorners;
const selectedOptionStyle = [continuousCorners, styles.selected];
const textInputStyle = [styles.textInput, continuousCorners];
const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;
const YES_NO_OPTIONS = [true, false] as const;
const EMPTY_SURVEY_QUESTIONS: readonly SurveyQuestion[] = [];
const EMPTY_SURVEY_ANSWERS: Readonly<Record<string, SurveyAnswer>> = {};
const SURVEY_FREE_TEXT_MAX_LENGTH = 4_000;
const starSymbol: SymbolViewProps['name'] = {
  ios: 'star.fill',
  android: 'star',
  web: 'star',
};
const yesSymbol: SymbolViewProps['name'] = {
  ios: 'checkmark',
  android: 'check',
  web: 'check',
};
const noSymbol: SymbolViewProps['name'] = {
  ios: 'xmark',
  android: 'close',
  web: 'close',
};
const successSymbol: SymbolViewProps['name'] = {
  ios: 'checkmark.circle.fill',
  android: 'check_circle',
  web: 'check_circle',
};

interface QuestionControlProps {
  readonly question: SurveyQuestion;
  readonly answer: SurveyAnswer | undefined;
  readonly language: string;
  readonly languageFontClass: string;
  readonly onChange: (answer: SurveyAnswer) => void;
}

function QuestionControl(props: QuestionControlProps) {
  switch (props.question.type) {
    case 'rating':
      return <RatingQuestionControl {...props} />;
    case 'multiple_choice':
      return <MultipleChoiceQuestionControl {...props} />;
    case 'yes_no':
      return <YesNoQuestionControl {...props} />;
    case 'free_text':
      return <FreeTextQuestionControl {...props} />;
  }
}

function RatingQuestionControl({ question, answer, language, onChange }: QuestionControlProps) {
  const { t } = useTranslation('surveys');
  return (
    <View
      className="flex-row justify-between gap-xs"
      accessibilityRole="radiogroup"
      accessibilityLabel={resolveSurveyCopy(question.prompt, language)}
    >
      {RATING_OPTIONS.map((rating) => (
        <PressableScale
          key={rating}
          testID={`survey-rating-${rating}`}
          accessibilityLabel={t('ratingLabel', { count: rating })}
          accessibilityRole="radio"
          isSelected={answer === rating}
          onPress={() => onChange(rating)}
          haptic="selection"
          style={answer === rating ? selectedOptionStyle : optionStyle}
          className={`min-h-recommended min-w-12 flex-1 items-center justify-center rounded-md border-2 border-neutral-200 ${answer === rating ? 'bg-primary/10' : 'bg-white'}`}
        >
          <SymbolView
            accessible={false}
            name={starSymbol}
            size={tokens.fontSize['3xl']}
            tintColor={tokens.colors.secondary.dark}
          />
        </PressableScale>
      ))}
    </View>
  );
}

function MultipleChoiceQuestionControl({
  question,
  answer,
  language,
  languageFontClass,
  onChange,
}: QuestionControlProps) {
  return (
    <View
      className="gap-md"
      accessibilityRole="radiogroup"
      accessibilityLabel={resolveSurveyCopy(question.prompt, language)}
    >
      {question.options?.map((option) => (
        <PressableScale
          key={option.id}
          testID={`survey-choice-${option.id}`}
          accessibilityLabel={resolveSurveyCopy(option.label, language)}
          accessibilityRole="radio"
          isSelected={answer === option.id}
          onPress={() => onChange(option.id)}
          haptic="selection"
          style={answer === option.id ? selectedOptionStyle : optionStyle}
          className={`min-h-recommended justify-center rounded-md border-2 border-neutral-200 px-lg py-md ${answer === option.id ? 'bg-primary/10' : 'bg-white'}`}
        >
          <Text
            style={styles.dynamicCopy}
            className={`text-center text-lg font-bold text-neutral-900 ${languageFontClass}`}
          >
            {resolveSurveyCopy(option.label, language)}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

function YesNoQuestionControl({
  question,
  answer,
  language,
  languageFontClass,
  onChange,
}: QuestionControlProps) {
  const { t } = useTranslation('surveys');
  return (
    <View
      className="flex-row gap-md"
      accessibilityRole="radiogroup"
      accessibilityLabel={resolveSurveyCopy(question.prompt, language)}
    >
      {YES_NO_OPTIONS.map((value) => (
        <PressableScale
          key={String(value)}
          testID={value ? 'survey-yes' : 'survey-no'}
          accessibilityLabel={value ? t('yes') : t('no')}
          accessibilityRole="radio"
          isSelected={answer === value}
          onPress={() => onChange(value)}
          haptic="selection"
          style={answer === value ? selectedOptionStyle : optionStyle}
          className={`min-h-recommended flex-1 flex-row items-center justify-center gap-sm rounded-md border-2 border-neutral-200 px-lg py-xl ${answer === value ? 'bg-primary/10' : 'bg-white'}`}
        >
          <SymbolView
            accessible={false}
            name={value ? yesSymbol : noSymbol}
            size={tokens.fontSize['2xl']}
            tintColor={tokens.colors.neutral[900]}
          />
          <Text className={`text-2xl font-bold text-neutral-900 ${languageFontClass}`}>
            {value ? t('yes') : t('no')}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

function FreeTextQuestionControl({
  question,
  answer,
  language,
  languageFontClass,
  onChange,
}: QuestionControlProps) {
  const { t } = useTranslation('surveys');
  return (
    <TextInput
      testID="survey-free-text"
      multiline
      value={typeof answer === 'string' ? answer : ''}
      onChangeText={onChange}
      placeholder={t('freeTextPlaceholder')}
      maxLength={SURVEY_FREE_TEXT_MAX_LENGTH}
      style={textInputStyle}
      className={`rounded-md border border-neutral-300 p-lg text-start text-lg text-neutral-900 ${languageFontClass}`}
      accessibilityLabel={resolveSurveyCopy(question.prompt, language)}
      accessibilityHint={t('freeTextPlaceholder')}
    />
  );
}

interface SurveyScreenFrameProps {
  readonly children: ReactNode;
  readonly contentContainerClassName: string;
  readonly contentInsets: StyleProp<ViewStyle>;
  readonly screenOptions: ComponentProps<typeof Stack.Screen>['options'];
}

function SurveyScreenFrame({
  children,
  contentContainerClassName,
  contentInsets,
  screenOptions,
}: SurveyScreenFrameProps) {
  return (
    <>
      <Stack.Screen options={screenOptions} />
      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName={contentContainerClassName}
        contentContainerStyle={contentInsets}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
    </>
  );
}

export default function SurveyScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t } = useTranslation('surveys');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { data: surveys, isPending, isError } = usePlayerSurveys();
  const {
    data: storedResponse,
    isPending: isResponsePending,
    isError: isResponseError,
  } = useOwnSurveyResponse(id);
  const {
    error: saveResponseError,
    isPending: isSavePending,
    mutateAsync: saveResponseAsync,
  } = useSaveSurveyResponse();
  const survey = surveys?.find((item) => item.id === id);
  const surveyId = survey?.id;
  const surveyQuestions = survey?.questions ?? EMPTY_SURVEY_QUESTIONS;
  const storedAnswers = storedResponse?.answers;
  const hasMissingResponseError = isResponseError && storedResponse === undefined;
  const orderedQuestions = useMemo(
    () => [...surveyQuestions].sort((left, right) => left.sortOrder - right.sortOrder),
    [surveyQuestions],
  );
  const [answers, setAnswers] =
    useState<Readonly<Record<string, SurveyAnswer>>>(EMPTY_SURVEY_ANSWERS);
  const [index, setIndex] = useState(0);
  const [initializedSurveyId, setInitializedSurveyId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (
      initializedSurveyId === surveyId ||
      surveyId === undefined ||
      isResponsePending ||
      hasMissingResponseError
    ) {
      return;
    }
    const initialAnswers = storedAnswers ?? EMPTY_SURVEY_ANSWERS;
    setAnswers(initialAnswers);
    setIndex(findSurveyResumeIndex(orderedQuestions, initialAnswers));
    setSubmitted(false);
    setInitializedSurveyId(surveyId);
  }, [
    initializedSurveyId,
    hasMissingResponseError,
    isResponsePending,
    orderedQuestions,
    storedAnswers,
    surveyId,
  ]);
  const question = orderedQuestions[index];
  const isAtEnd = index >= orderedQuestions.length - 1;
  const currentAnswer = question === undefined ? undefined : answers[question.id];
  const canContinue =
    question !== undefined &&
    (!question.required ||
      (currentAnswer !== undefined &&
        !(typeof currentAnswer === 'string' && currentAnswer.trim().length === 0)));

  const persist = useCallback(
    (complete: boolean) => {
      if (surveyId === undefined) return Promise.resolve();
      return saveResponseAsync({
        surveyId,
        questions: orderedQuestions,
        answers,
        complete,
      }).then(() => undefined);
    },
    [answers, orderedQuestions, saveResponseAsync, surveyId],
  );

  async function next() {
    if (!canContinue) return;
    try {
      if (isAtEnd) {
        await persist(true);
        setSubmitted(true);
        return;
      }
      await persist(false);
      setIndex((current) => current + 1);
    } catch {
      return;
    }
  }

  async function saveAndExit() {
    try {
      await persist(false);
      back();
    } catch {
      return;
    }
  }

  const contentInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? { paddingBottom: insets.bottom + tokens.spacing.lg }
        : undefined,
    [insets.bottom],
  );
  const screenOptions = useMemo(
    () => ({
      headerShown: true,
      headerBackButtonDisplayMode: 'minimal' as const,
      title: survey === undefined ? t('title') : resolveSurveyCopy(survey.title, language),
    }),
    [language, survey, t],
  );

  const isInitialLoad =
    (isPending && surveys === undefined) ||
    (survey !== undefined &&
      ((isResponsePending && storedResponse === undefined) || initializedSurveyId !== survey.id));
  const hasLoadError =
    (isError && surveys === undefined) ||
    (isResponseError && storedResponse === undefined) ||
    (surveys !== undefined && survey === undefined);
  const saveError = saveResponseError === null ? null : toAppError(saveResponseError);

  if (isInitialLoad && !hasLoadError) {
    return (
      <SurveyScreenFrame
        screenOptions={screenOptions}
        contentInsets={contentInsets}
        contentContainerClassName="grow items-center justify-center p-lg"
      >
        <Text
          accessible
          accessibilityLabel={t('common:loading')}
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
        >
          {t('common:loading')}
        </Text>
      </SurveyScreenFrame>
    );
  }
  if (hasLoadError || survey === undefined) {
    return (
      <SurveyScreenFrame
        screenOptions={screenOptions}
        contentInsets={contentInsets}
        contentContainerClassName="grow items-center justify-center p-lg"
      >
        <Text selectable accessibilityRole="alert">
          {t('loadError')}
        </Text>
      </SurveyScreenFrame>
    );
  }
  if (submitted || storedResponse?.status === 'completed') {
    return (
      <SurveyScreenFrame
        screenOptions={screenOptions}
        contentInsets={contentInsets}
        contentContainerClassName="grow items-center justify-center gap-lg p-xl"
      >
        <View testID="survey-completion" className="w-full items-center gap-lg">
          <SymbolView
            accessible={false}
            name={successSymbol}
            size={tokens.fontSize['4xl']}
            tintColor={tokens.colors.success}
          />
          <Text
            accessibilityRole="header"
            className={`text-center text-2xl font-bold ${languageFontClass}`}
          >
            {submitted ? t('thankTitle') : t('alreadyCompleted')}
          </Text>
          <Text className={`text-center text-lg text-neutral-600 ${languageFontClass}`}>
            {t('thankBody')}
          </Text>
          <View className="w-full max-w-form">
            <AuthSubmitButton label={t('back')} onPress={back} />
          </View>
        </View>
      </SurveyScreenFrame>
    );
  }
  if (question === undefined) {
    return (
      <SurveyScreenFrame
        screenOptions={screenOptions}
        contentInsets={contentInsets}
        contentContainerClassName="grow items-center justify-center p-lg"
      >
        <Text selectable accessibilityRole="alert">
          {t('loadError')}
        </Text>
      </SurveyScreenFrame>
    );
  }

  return (
    <SurveyScreenFrame
      screenOptions={screenOptions}
      contentInsets={contentInsets}
      contentContainerClassName="grow px-lg py-lg"
    >
      <FormWidth className="grow justify-between gap-xl">
        <View className="gap-xl">
          <View className="gap-sm">
            <Text
              style={styles.dynamicCopy}
              className={`text-start text-sm font-bold uppercase text-primary ${languageFontClass}`}
            >
              {resolveSurveyCopy(survey.title, language)}
            </Text>
            <Text
              className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}
            >
              {t('progress', { current: index + 1, total: orderedQuestions.length })}
            </Text>
            <View className="flex-row gap-xs" accessibilityElementsHidden>
              {orderedQuestions.map((item, dotIndex) => (
                <View
                  key={item.id}
                  className={`h-2 flex-1 rounded-full ${dotIndex <= index ? 'bg-primary' : 'bg-neutral-200'}`}
                />
              ))}
            </View>
          </View>
          {index === 0 ? (
            <View className="rounded-lg bg-secondary-light p-md" style={continuousCorners}>
              <Text className={`text-start text-sm text-neutral-900 ${languageFontClass}`}>
                {t('attributedNotice')}
              </Text>
            </View>
          ) : null}
          <View className="gap-lg">
            <Text
              accessibilityRole="header"
              style={styles.dynamicCopy}
              className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {resolveSurveyCopy(question.prompt, language)}
            </Text>
            {!question.required ? (
              <Text className={`text-sm text-neutral-500 ${languageFontClass}`}>
                {t('optional')}
              </Text>
            ) : null}
            <QuestionControl
              question={question}
              answer={currentAnswer}
              language={language}
              languageFontClass={languageFontClass}
              onChange={(answer) =>
                setAnswers((current) => ({ ...current, [question.id]: answer }))
              }
            />
          </View>
        </View>
        <View className="gap-md">
          {saveError === null ? null : <FailureNotice code={saveError.code} message={t('error')} />}
          <AuthSubmitButton
            label={isAtEnd ? t('submit') : t('next')}
            onPress={() => void next()}
            isLoading={isSavePending}
            disabled={!canContinue}
            testID="survey-next"
          />
          <PressableScale
            accessibilityLabel={t('saveExit')}
            onPress={() => void saveAndExit()}
            haptic="tapLight"
            isBusy={isSavePending}
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
          >
            <Text className={`font-bold text-neutral-700 ${languageFontClass}`}>
              {t('saveExit')}
            </Text>
          </PressableScale>
        </View>
      </FormWidth>
    </SurveyScreenFrame>
  );
}
