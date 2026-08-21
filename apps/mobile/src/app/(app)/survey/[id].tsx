import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { composeContinuousViewStyle, continuousCorners } from '@/lib/continuous-corners';
import {
  useOwnSurveyResponse,
  usePlayerSurveys,
  useSaveSurveyResponse,
} from '@/lib/player-surveys';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLanguageDirection, useLanguage } from '@ramassa/shared/i18n';
import {
  findSurveyResumeIndex,
  resolveSurveyCopy,
  type SurveyAnswer,
  type SurveyQuestion,
} from '@ramassa/shared/surveys';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  option: {
    minHeight: tokens.tapTarget.recommended,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: tokens.colors.neutral[200],
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  selected: { borderColor: tokens.colors.primary.DEFAULT, backgroundColor: '#F2F7FF' },
  textInput: {
    minHeight: 144,
    borderWidth: 1,
    borderColor: tokens.colors.neutral[300],
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.lg,
    textAlignVertical: 'top',
  },
});
const optionStyle = composeContinuousViewStyle(styles.option);
const selectedOptionStyle = [optionStyle, styles.selected];
const STAR_SYMBOL = String.fromCodePoint(0x2605);
const CHECK_SYMBOL = String.fromCodePoint(0x2713);

function QuestionControl({
  question,
  answer,
  language,
  languageFontClass,
  onChange,
}: {
  readonly question: SurveyQuestion;
  readonly answer: SurveyAnswer | undefined;
  readonly language: string;
  readonly languageFontClass: string;
  readonly onChange: (answer: SurveyAnswer) => void;
}) {
  const { t } = useTranslation('surveys');
  if (question.type === 'rating') {
    return (
      <View className="flex-row justify-between gap-xs" accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((rating) => (
          <PressableScale
            key={rating}
            accessibilityLabel={t('ratingLabel', { count: rating })}
            accessibilityRole="radio"
            isSelected={answer === rating}
            onPress={() => onChange(rating)}
            haptic="selection"
            style={answer === rating ? selectedOptionStyle : optionStyle}
            className="min-h-recommended min-w-12 flex-1 items-center justify-center rounded-md border-2 border-neutral-200"
          >
            <Text className="text-3xl text-amber-500">{STAR_SYMBOL}</Text>
          </PressableScale>
        ))}
      </View>
    );
  }
  if (question.type === 'multiple_choice') {
    return (
      <View className="gap-md" accessibilityRole="radiogroup">
        {question.options?.map((option) => (
          <PressableScale
            key={option.id}
            accessibilityLabel={resolveSurveyCopy(option.label, language)}
            accessibilityRole="radio"
            isSelected={answer === option.id}
            onPress={() => onChange(option.id)}
            haptic="selection"
            style={answer === option.id ? selectedOptionStyle : optionStyle}
            className="min-h-recommended justify-center rounded-md border-2 border-neutral-200 px-lg py-md"
          >
            <Text className={`text-center text-lg font-bold text-neutral-900 ${languageFontClass}`}>
              {resolveSurveyCopy(option.label, language)}
            </Text>
          </PressableScale>
        ))}
      </View>
    );
  }
  if (question.type === 'yes_no') {
    return (
      <View className="flex-row gap-md" accessibilityRole="radiogroup">
        {[true, false].map((value) => (
          <PressableScale
            key={String(value)}
            accessibilityLabel={value ? t('yes') : t('no')}
            accessibilityRole="radio"
            isSelected={answer === value}
            onPress={() => onChange(value)}
            haptic="selection"
            style={answer === value ? selectedOptionStyle : optionStyle}
            className="min-h-recommended flex-1 items-center justify-center rounded-md border-2 border-neutral-200 px-lg py-xl"
          >
            <Text className={`text-2xl font-bold text-neutral-900 ${languageFontClass}`}>
              {value ? `✓ ${t('yes')}` : `× ${t('no')}`}
            </Text>
          </PressableScale>
        ))}
      </View>
    );
  }
  return (
    <TextInput
      multiline
      value={typeof answer === 'string' ? answer : ''}
      onChangeText={onChange}
      placeholder={t('freeTextPlaceholder')}
      maxLength={4000}
      style={[styles.textInput, continuousCorners]}
      className={`text-start text-lg text-neutral-900 ${languageFontClass}`}
      accessibilityLabel={t('freeTextPlaceholder')}
    />
  );
}

export default function SurveyScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t } = useTranslation('surveys');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { data: surveys, isPending, isError } = usePlayerSurveys();
  const { data: storedResponse, isPending: isResponsePending } = useOwnSurveyResponse(id);
  const saveResponse = useSaveSurveyResponse();
  const survey = surveys?.find((item) => item.id === id);
  const [answers, setAnswers] = useState<Readonly<Record<string, SurveyAnswer>>>({});
  const [index, setIndex] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const insets = useSafeAreaInsets();
  const isRtl = getLanguageDirection(language) === 'rtl';

  useEffect(() => {
    if (initialized || survey === undefined || isResponsePending) return;
    const initialAnswers = storedResponse?.answers ?? {};
    setAnswers(initialAnswers);
    setIndex(findSurveyResumeIndex(survey.questions, initialAnswers));
    setInitialized(true);
  }, [initialized, isResponsePending, storedResponse, survey]);

  const orderedQuestions = useMemo(
    () => [...(survey?.questions ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [survey?.questions],
  );
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
      if (survey === undefined) return Promise.resolve();
      return saveResponse
        .mutateAsync({
          surveyId: survey.id,
          questions: orderedQuestions,
          answers,
          complete,
        })
        .then(() => undefined);
    },
    [answers, orderedQuestions, saveResponse, survey],
  );

  async function next() {
    if (!canContinue) return;
    if (isAtEnd) {
      await persist(true);
      setSubmitted(true);
      return;
    }
    await persist(false);
    setIndex((current) => current + 1);
  }

  async function saveAndExit() {
    await persist(false);
    back();
  }

  const contentInsets =
    process.env.EXPO_OS === 'android'
      ? {
          paddingTop: insets.top + tokens.spacing.lg,
          paddingBottom: insets.bottom + tokens.spacing.lg,
        }
      : undefined;

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text>{t('common:loading')}</Text>
      </View>
    );
  }
  if (isError || survey === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-lg">
        <Text>{t('loadError')}</Text>
      </View>
    );
  }
  if (submitted || storedResponse?.status === 'completed') {
    return (
      <View className="flex-1 items-center justify-center gap-lg bg-white p-xl">
        <Text className="text-5xl">{CHECK_SYMBOL}</Text>
        <Text
          accessibilityRole="header"
          className={`text-center text-2xl font-bold ${languageFontClass}`}
        >
          {submitted ? t('thankTitle') : t('alreadyCompleted')}
        </Text>
        <Text className={`text-center text-lg text-neutral-600 ${languageFontClass}`}>
          {t('thankBody')}
        </Text>
        <AuthSubmitButton label={t('back')} onPress={back} />
      </View>
    );
  }
  if (question === undefined) return null;

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="grow px-lg py-lg"
      contentContainerStyle={contentInsets}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      <FormWidth className="grow justify-between gap-xl">
        <View className="gap-xl">
          <PressableScale
            accessibilityLabel={t('back')}
            onPress={back}
            haptic="tapLight"
            className={`min-h-recommended justify-center rounded-full border border-neutral-300 px-lg ${isRtl ? 'self-end' : 'self-start'}`}
          >
            <Text className={`font-medium text-primary ${languageFontClass}`}>{t('back')}</Text>
          </PressableScale>
          <View className="gap-sm">
            <Text
              className={`text-start text-sm font-bold uppercase text-primary ${languageFontClass}`}
            >
              {resolveSurveyCopy(survey.title, language)}
            </Text>
            <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
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
            <View className="rounded-lg bg-amber-50 p-md" style={continuousCorners}>
              <Text className={`text-start text-sm text-amber-900 ${languageFontClass}`}>
                {t('attributedNotice')}
              </Text>
            </View>
          ) : null}
          <View className="gap-lg">
            <Text
              accessibilityRole="header"
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
          <AuthSubmitButton
            label={isAtEnd ? t('submit') : t('next')}
            onPress={() => void next()}
            isLoading={saveResponse.isPending}
            disabled={!canContinue}
            testID="survey-next"
          />
          <PressableScale
            accessibilityLabel={t('saveExit')}
            onPress={() => void saveAndExit()}
            isBusy={saveResponse.isPending}
            className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
          >
            <Text className={`font-bold text-neutral-700 ${languageFontClass}`}>
              {t('saveExit')}
            </Text>
          </PressableScale>
        </View>
      </FormWidth>
    </ScrollView>
  );
}
