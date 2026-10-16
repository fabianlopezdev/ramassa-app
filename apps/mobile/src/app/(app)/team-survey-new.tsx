/**
 * A new survey on the phone (RAPP-384), for `surveys.manage` holders, as the
 * web admin's form: a Catalan title, an optional linked activity, when it is
 * published and closes (Madrid time), who receives it, and up to thirty
 * questions of four kinds. Every text is written in Catalan; one button asks
 * for all the drafts, and each language is approved before it can be saved.
 * Choices take a Catalan label with its own review, where the web form asks
 * for the five labels by hand.
 */
import { DateTimeField } from '@/components/content/date-time-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { AudiencePicker } from '@/components/team/audience-picker';
import { ReviewedField, type ReviewedText } from '@/components/team/reviewed-field';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useSaveSurvey, useSurveyAudienceChoices } from '@/lib/team-surveys';
import { generateDrafts } from '@/lib/translation-worker';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NotificationAudience } from '@ramassa/shared/notifications';
import type { SurveyQuestion, SurveyQuestionType } from '@ramassa/shared/surveys';

const QUESTION_TYPES: readonly SurveyQuestionType[] = [
  'rating',
  'multiple_choice',
  'yes_no',
  'free_text',
];
const TITLE_MAX = 160;
const TEXT_MAX = 1000;
const MAX_QUESTIONS = 30;
const MIN_CHOICES = 2;
const MAX_CHOICES = 12;
const NO_EVENT = 'none';
const TITLE_KEY = 'title';

interface DraftChoice {
  readonly id: string;
  readonly source: string;
}

interface DraftQuestion {
  readonly id: string;
  readonly type: SurveyQuestionType;
  readonly source: string;
  readonly required: boolean;
  readonly choices: readonly DraftChoice[];
}

type Notice = 'translations' | 'publishAt' | 'dates' | 'error' | null;

const promptKey = (questionId: string) => `prompt:${questionId}`;
const choiceKey = (questionId: string, choiceId: string) => `choice:${questionId}:${choiceId}`;

function starterChoices(): readonly DraftChoice[] {
  return [
    { id: 'option_1', source: '' },
    { id: 'option_2', source: '' },
  ];
}

function newQuestion(type: SurveyQuestionType = 'rating'): DraftQuestion {
  return {
    id: randomUUID(),
    type,
    source: '',
    required: type !== 'free_text',
    choices: type === 'multiple_choice' ? starterChoices() : [],
  };
}

/** The next free `option_N`, so a removed choice never lends its id. */
function nextChoiceId(choices: readonly DraftChoice[]): string {
  const used = choices.map((choice) => Number(choice.id.replace('option_', '')) || 0);
  return `option_${Math.max(0, ...used) + 1}`;
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const fontClass = useLanguageFontClass();
  return (
    <View
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function OutlineButton({
  testID,
  label,
  onPress,
  isDisabled = false,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly isDisabled?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isDisabled={isDisabled}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended items-center justify-center rounded-md border px-lg ${
        isDisabled ? 'border-neutral-200 bg-neutral-100' : 'border-neutral-300 bg-white'
      }`}
    >
      <Text
        className={`text-center text-md font-bold ${isDisabled ? 'text-neutral-500' : 'text-primary-dark'} ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export default function TeamSurveyNewScreen() {
  const { t } = useTranslation('surveys');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { groups, options } = useSurveyAudienceChoices();
  const save = useSaveSurvey();
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState<string>(NO_EVENT);
  const [publishedAt, setPublishedAt] = useState<string | null>(() => new Date().toISOString());
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [audience, setAudience] = useState<NotificationAudience | null>({ kind: 'all' });
  const [questions, setQuestions] = useState<readonly DraftQuestion[]>(() => [newQuestion()]);
  const [reviews, setReviews] = useState<Readonly<Record<string, ReviewedText>>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const touch = () => setNotice(null);

  const report = useCallback((key: string, text: ReviewedText | null) => {
    setReviews((current) => {
      if (text !== null) return { ...current, [key]: text };
      if (!(key in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([name]) => name !== key));
    });
  }, []);

  const updateQuestion = (id: string, patch: Partial<DraftQuestion>) => {
    touch();
    setQuestions((current) =>
      current.map((question) => (question.id === id ? { ...question, ...patch } : question)),
    );
  };

  // Every text in form order, with the review that holds its drafts.
  const texts = [
    { key: TITLE_KEY, source: title },
    ...questions.flatMap((question) => [
      { key: promptKey(question.id), source: question.source },
      ...question.choices.map((choice) => ({
        key: choiceKey(question.id, choice.id),
        source: choice.source,
      })),
    ]),
  ];
  const canGenerate =
    !isGenerating &&
    texts.every((text) => text.source.trim().length > 0 && reviews[text.key] !== undefined);

  const generate = async () => {
    touch();
    setIsGenerating(true);
    const failure = await generateDrafts(
      texts.map((text) => ({ source: text.source, start: reviews[text.key]!.start })),
    );
    setIsGenerating(false);
    if (failure !== null) setNotice('error');
  };

  const submit = () => {
    const titleCopy = reviews[TITLE_KEY]?.copy ?? null;
    const reviewed = questions.map((question, index) => {
      const prompt = reviews[promptKey(question.id)]?.copy ?? null;
      const choices = question.choices.map((choice) => ({
        id: choice.id,
        label: reviews[choiceKey(question.id, choice.id)]?.copy ?? null,
      }));
      if (prompt === null || choices.some((choice) => choice.label === null)) return null;
      const definition: SurveyQuestion = {
        id: question.id,
        type: question.type,
        prompt,
        options:
          question.type === 'multiple_choice'
            ? choices.map((choice) => ({ id: choice.id, label: choice.label! }))
            : null,
        required: question.required,
        sortOrder: (index + 1) * 10,
      };
      return definition;
    });
    if (titleCopy === null || reviewed.some((question) => question === null)) {
      setNotice('translations');
      return;
    }
    if (publishedAt === null) {
      setNotice('publishAt');
      return;
    }
    if (closesAt !== null && Date.parse(closesAt) <= Date.parse(publishedAt)) {
      setNotice('dates');
      return;
    }
    if (audience === null) return;
    save.mutate(
      {
        title: titleCopy,
        eventId: eventId === NO_EVENT ? null : eventId,
        publishedAt,
        closesAt,
        audience,
        questions: reviewed.filter((question) => question !== null),
      },
      {
        onSuccess: () => {
          playHaptic('success');
          back();
        },
        onError: () => {
          playHaptic('error');
          setNotice('error');
        },
      },
    );
  };

  const noticeText =
    notice === 'translations'
      ? t('translationRequired')
      : notice === 'publishAt'
        ? t('publishAtRequired')
        : notice === 'dates'
          ? t('datesInvalid')
          : notice === 'error'
            ? t('error')
            : null;

  return (
    <SafeAreaView
      testID="team-survey-new"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
      >
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="team-survey-new-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
          >
            {t('newSurvey')}
          </Text>

          <Section title={t('newSurvey')}>
            <ReviewedField
              reviewKey={TITLE_KEY}
              testIDPrefix="survey-title"
              label={t('surveyTitle')}
              value={title}
              onChangeText={setTitle}
              onTouch={touch}
              onReport={report}
              maxLength={TITLE_MAX}
            />
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('eventLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-sm">
              {[{ id: NO_EVENT, title: t('noEvent') }, ...(options.data?.events ?? [])].map(
                (event) => (
                  <ChoiceOption
                    key={event.id}
                    testID={`survey-event-${event.id}`}
                    value={event.id}
                    label={event.title}
                    selected={event.id === eventId}
                    onSelect={(next) => {
                      touch();
                      setEventId(next);
                    }}
                    languageFontClass={fontClass}
                  />
                ),
              )}
            </View>
            <DateTimeField
              testID="survey-published-at"
              label={t('publishAt')}
              value={publishedAt}
              onChange={(next) => {
                touch();
                setPublishedAt(next);
              }}
              inMadridTime
            />
            <DateTimeField
              testID="survey-closes-at"
              label={t('closesAt')}
              value={closesAt}
              onChange={(next) => {
                touch();
                setClosesAt(next);
              }}
              emptyLabel={t('optional')}
              inMadridTime
            />
            {options.data === undefined ? null : (
              <AudiencePicker
                testIDPrefix="survey"
                audience={audience}
                groups={groups.data ?? []}
                options={options.data}
                onChange={(next) => {
                  touch();
                  setAudience(next);
                }}
              />
            )}
          </Section>

          <Section title={t('questionsTitle')}>
            {questions.map((question, index) => (
              <View
                key={question.id}
                testID={`survey-question-${index}`}
                style={continuousCorners}
                className="gap-md rounded-md bg-neutral-50 p-md"
              >
                <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
                  {t('questionType')}
                </Text>
                <View className="flex-row flex-wrap gap-sm">
                  {QUESTION_TYPES.map((type) => (
                    <ChoiceOption
                      key={type}
                      testID={`survey-question-${index}-type-${type}`}
                      value={type}
                      label={t(type)}
                      selected={type === question.type}
                      onSelect={(next) =>
                        updateQuestion(question.id, {
                          type: next,
                          required: next !== 'free_text',
                          choices: next === 'multiple_choice' ? starterChoices() : [],
                        })
                      }
                      languageFontClass={fontClass}
                    />
                  ))}
                </View>
                <ReviewedField
                  reviewKey={promptKey(question.id)}
                  testIDPrefix={`survey-question-${index}-prompt`}
                  label={t('prompt')}
                  value={question.source}
                  onChangeText={(next) => updateQuestion(question.id, { source: next })}
                  onTouch={touch}
                  onReport={report}
                  maxLength={TEXT_MAX}
                  multiline
                />
                {question.type === 'multiple_choice' ? (
                  <View className="gap-md">
                    <Text
                      className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}
                    >
                      {t('choices')}
                    </Text>
                    {question.choices.map((choice, choiceIndex) => (
                      <View key={choice.id} className="gap-sm">
                        <ReviewedField
                          reviewKey={choiceKey(question.id, choice.id)}
                          testIDPrefix={`survey-question-${index}-choice-${choiceIndex}`}
                          label={t('choiceLabel', { number: choiceIndex + 1 })}
                          value={choice.source}
                          onChangeText={(next) =>
                            updateQuestion(question.id, {
                              choices: question.choices.map((item) =>
                                item.id === choice.id ? { ...item, source: next } : item,
                              ),
                            })
                          }
                          onTouch={touch}
                          onReport={report}
                          maxLength={TEXT_MAX}
                        />
                        <OutlineButton
                          testID={`survey-question-${index}-choice-${choiceIndex}-remove`}
                          label={t('removeChoice')}
                          isDisabled={question.choices.length <= MIN_CHOICES}
                          onPress={() =>
                            updateQuestion(question.id, {
                              choices: question.choices.filter((item) => item.id !== choice.id),
                            })
                          }
                        />
                      </View>
                    ))}
                    <OutlineButton
                      testID={`survey-question-${index}-add-choice`}
                      label={t('addChoice')}
                      isDisabled={question.choices.length >= MAX_CHOICES}
                      onPress={() =>
                        updateQuestion(question.id, {
                          choices: [
                            ...question.choices,
                            { id: nextChoiceId(question.choices), source: '' },
                          ],
                        })
                      }
                    />
                  </View>
                ) : null}
                <View className="flex-row flex-wrap gap-sm">
                  <ChoiceOption
                    testID={`survey-question-${index}-required`}
                    value="required"
                    label={t('required')}
                    selected={question.required}
                    onSelect={() => updateQuestion(question.id, { required: !question.required })}
                    languageFontClass={fontClass}
                  />
                </View>
                <OutlineButton
                  testID={`survey-question-${index}-remove`}
                  label={t('removeQuestion')}
                  isDisabled={questions.length === 1}
                  onPress={() => {
                    touch();
                    setQuestions((current) => current.filter((item) => item.id !== question.id));
                  }}
                />
              </View>
            ))}
            <OutlineButton
              testID="survey-add-question"
              label={t('addQuestion')}
              isDisabled={questions.length >= MAX_QUESTIONS}
              onPress={() => {
                touch();
                setQuestions((current) => [...current, newQuestion()]);
              }}
            />
          </Section>

          <View className="gap-sm">
            <PressableScale
              testID="survey-generate"
              accessibilityRole="button"
              accessibilityLabel={isGenerating ? t('generating') : t('generateTranslations')}
              onPress={() => void generate()}
              isBusy={isGenerating}
              isDisabled={!canGenerate}
              haptic="tapLight"
              style={continuousCorners}
              className={`min-h-recommended items-center justify-center rounded-md border px-lg ${
                canGenerate ? 'border-primary bg-white' : 'border-neutral-200 bg-neutral-100'
              }`}
            >
              <Text
                className={`text-center text-md font-bold ${canGenerate ? 'text-primary-dark' : 'text-neutral-500'} ${fontClass}`}
              >
                {isGenerating ? t('generating') : t('generateTranslations')}
              </Text>
            </PressableScale>
            <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
              {t('translationHelp')}
            </Text>
            <PressableScale
              testID="survey-save"
              accessibilityRole="button"
              accessibilityLabel={save.isPending ? t('saving') : t('savePublish')}
              onPress={submit}
              isBusy={save.isPending}
              isDisabled={audience === null}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                {save.isPending ? t('saving') : t('savePublish')}
              </Text>
            </PressableScale>
            {noticeText === null ? null : (
              <Text
                testID="survey-notice"
                accessibilityLiveRegion="polite"
                className={`text-start text-sm text-error ${fontClass}`}
              >
                {noticeText}
              </Text>
            )}
          </View>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
