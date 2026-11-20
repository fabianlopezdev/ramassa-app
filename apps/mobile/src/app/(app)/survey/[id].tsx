import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { SelectionChoiceCard } from '@/components/auth/selection-choice-card';
import { FailureNotice } from '@/components/error-code-line';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { SelectionChoiceSurface } from '@/components/forms/selection-choice-surface';
import { Icon } from '@/components/icons/icon';
import { FormWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ActionScreen } from '@/components/layout/screen-action';
import {
  screenBlockGapClassName,
  screenContentClassName,
} from '@/components/layout/screen-spacing';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  useOwnSurveyResponse,
  usePlayerSurveys,
  useSaveSurveyResponse,
} from '@/lib/player-surveys';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  textInput: {
    minHeight: tokens.spacing['3xl'] * 2 + tokens.spacing.md,
    textAlignVertical: 'top',
    writingDirection: 'auto',
  },
  dynamicCopy: { writingDirection: 'auto' },
});
const textInputStyle = [styles.textInput, continuousCorners];
const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;
const YES_NO_OPTIONS = [true, false] as const;
const EMPTY_SURVEY_QUESTIONS: readonly SurveyQuestion[] = [];
const EMPTY_SURVEY_ANSWERS: Readonly<Record<string, SurveyAnswer>> = {};
const SURVEY_FREE_TEXT_MAX_LENGTH = 4_000;

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
        <SelectionChoiceSurface
          key={rating}
          testID={`survey-rating-${rating}`}
          label={t('ratingLabel', { count: rating })}
          accessibilityRole="radio"
          isSelected={answer === rating}
          onPress={() => onChange(rating)}
          className="flex-1"
          paddingClassName="px-xs"
          contentClassName="items-center justify-center"
        >
          <Icon
            name="star"
            weight="boldDuotone"
            size={tokens.fontSize['3xl']}
            color={tokens.colors.secondary.dark}
          />
        </SelectionChoiceSurface>
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
        <SelectionChoiceCard
          key={option.id}
          testID={`survey-choice-${option.id}`}
          label={resolveSurveyCopy(option.label, language)}
          fontClass={languageFontClass}
          isSelected={answer === option.id}
          onPress={() => onChange(option.id)}
        />
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
        <SelectionChoiceSurface
          key={String(value)}
          testID={value ? 'survey-yes' : 'survey-no'}
          label={value ? t('yes') : t('no')}
          accessibilityRole="radio"
          isSelected={answer === value}
          onPress={() => onChange(value)}
          className="flex-1"
          contentClassName="flex-row items-center justify-center gap-sm py-lg"
        >
          <Icon
            name={value ? 'check' : 'close'}
            size={tokens.fontSize['2xl']}
            color={tokens.colors.neutral[900]}
          />
          <Text className={`text-2xl font-bold text-neutral-900 ${languageFontClass}`}>
            {value ? t('yes') : t('no')}
          </Text>
        </SelectionChoiceSurface>
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
  readonly screenTitle: string;
  /** The screen's call to action, at the bottom of the screen (RAPP-881). */
  readonly action?: ReactNode;
}

function SurveyScreenFrame({
  children,
  contentContainerClassName,
  contentInsets,
  screenTitle,
  action,
}: SurveyScreenFrameProps) {
  return (
    <ActionScreen className="bg-white" action={action}>
      <NativeScreenHeader surface="white" title={screenTitle} />
      <ScrollView
        className="flex-1"
        contentContainerClassName={contentContainerClassName}
        contentContainerStyle={contentInsets}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
    </ActionScreen>
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
  const screenTitle = survey === undefined ? t('title') : resolveSurveyCopy(survey.title, language);

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
        screenTitle={screenTitle}
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
        screenTitle={screenTitle}
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
        screenTitle={screenTitle}
        contentInsets={contentInsets}
        contentContainerClassName={`grow items-center justify-center ${screenContentClassName}`}
        action={<AuthSubmitButton label={t('back')} onPress={back} />}
      >
        <View testID="survey-completion" className="w-full items-center gap-lg">
          <Icon
            name="check-circle"
            weight="boldDuotone"
            size={tokens.fontSize['4xl']}
            color={tokens.colors.success}
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
        </View>
      </SurveyScreenFrame>
    );
  }
  if (question === undefined) {
    return (
      <SurveyScreenFrame
        screenTitle={screenTitle}
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
      screenTitle={screenTitle}
      contentInsets={contentInsets}
      contentContainerClassName="grow px-lg py-lg"
      action={
        <>
          <AuthSubmitButton
            label={isAtEnd ? t('submit') : t('next')}
            onPress={() => void next()}
            isLoading={isSavePending}
            disabled={!canContinue}
            testID="survey-next"
          />
          <RaisedActionButton
            label={t('saveExit')}
            onPress={() => void saveAndExit()}
            isDisabled={isSavePending}
          />
        </>
      }
    >
      <FormWidth className={screenBlockGapClassName}>
        <View className={screenBlockGapClassName}>
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
        {saveError === null ? null : <FailureNotice code={saveError.code} message={t('error')} />}
      </FormWidth>
    </SurveyScreenFrame>
  );
}
