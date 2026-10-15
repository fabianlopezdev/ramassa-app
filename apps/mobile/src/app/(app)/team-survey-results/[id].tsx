/**
 * One survey's results on the phone (RAPP-384), for `surveys.results`
 * holders, as the web admin's results: per question the stars' average and
 * spread, how often each choice and each of yes and no was picked, and the
 * written answers with who wrote them; then each participant's response and
 * whether it is complete. Answers are attributed, so they stay in memory.
 * Share CSV (RAPP-402) asks for the step-up, the database records the export,
 * and the file goes to the share sheet.
 */
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useStaffSurveys, useSurveyExport, useSurveyResponses } from '@/lib/team-surveys';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import {
  aggregateSurveyResults,
  resolveSurveyCopy,
  type SurveyQuestion,
} from '@ramassa/shared/surveys';

const RATINGS = ['5', '4', '3', '2', '1'] as const;

function CountRow({
  testID,
  label,
  count,
  total,
}: {
  readonly testID: string;
  readonly label: string;
  readonly count: number;
  readonly total: number;
}) {
  const fontClass = useLanguageFontClass();
  const share = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <View testID={testID} className="gap-xs">
      <View className="flex-row items-center justify-between gap-sm">
        <Text className={`flex-1 text-start text-md text-neutral-800 ${fontClass}`}>{label}</Text>
        <Text className={`text-md font-semibold tabular-nums text-neutral-900 ${fontClass}`}>
          {count}
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <View className="h-2 rounded-full bg-primary" style={{ width: `${share}%` }} />
      </View>
    </View>
  );
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
        className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function TeamSurveyResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation('surveys');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const language = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const surveys = useStaffSurveys();
  const survey = surveys.data?.find((item) => item.id === id);
  const responses = useSurveyResponses(id, survey !== undefined);
  const { t: tExport } = useTranslation(['admin', 'errors']);
  const exportCsv = useSurveyExport(t('exportCsv'));
  const [exportNotice, setExportNotice] = useState<{
    readonly ok: boolean;
    readonly text: string;
  } | null>(null);
  const questions = useMemo<readonly SurveyQuestion[]>(
    () => [...(survey?.questions ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [survey],
  );
  const results = useMemo(
    () => aggregateSurveyResults(questions, responses.data ?? []),
    [questions, responses.data],
  );

  const resultFor = (question: SurveyQuestion) => {
    const result = results.byQuestion[question.id];
    if (result === undefined) return null;
    if (result.type === 'rating') {
      const total = RATINGS.reduce((sum, rating) => sum + (result.counts[rating] ?? 0), 0);
      return (
        <View className="gap-sm">
          <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
            {t('averageRating', { value: result.average.toFixed(1) })}
          </Text>
          {RATINGS.map((rating) => (
            <CountRow
              key={rating}
              testID={`survey-result-${question.id}-${rating}`}
              label={t('ratingLabel', { count: Number(rating) })}
              count={result.counts[rating] ?? 0}
              total={total}
            />
          ))}
        </View>
      );
    }
    if (result.type === 'multiple_choice') {
      const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      return (
        <View className="gap-sm">
          {(question.options ?? []).map((choice) => (
            <CountRow
              key={choice.id}
              testID={`survey-result-${question.id}-${choice.id}`}
              label={resolveSurveyCopy(choice.label, language)}
              count={result.counts[choice.id] ?? 0}
              total={total}
            />
          ))}
        </View>
      );
    }
    if (result.type === 'yes_no') {
      const total = result.yes + result.no;
      return (
        <View className="gap-sm">
          <CountRow
            testID={`survey-result-${question.id}-yes`}
            label={t('yes')}
            count={result.yes}
            total={total}
          />
          <CountRow
            testID={`survey-result-${question.id}-no`}
            label={t('no')}
            count={result.no}
            total={total}
          />
        </View>
      );
    }
    return result.answers.length === 0 ? (
      <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>{t('noResponses')}</Text>
    ) : (
      <View className="gap-sm">
        {result.answers.map((answer) => (
          <View
            key={answer.playerId}
            testID={`survey-result-${question.id}-${answer.playerId}`}
            style={continuousCorners}
            className="gap-xs rounded-md bg-neutral-50 p-md"
          >
            <Text className={`text-start text-sm font-semibold text-neutral-700 ${fontClass}`}>
              {answer.playerName}
            </Text>
            <Text className="text-start text-md text-neutral-900">{answer.value}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView
      testID="team-survey-results"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="team-survey-results-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          {survey === undefined ? (
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {surveys.isError ? t('loadError') : t('loadingResponses')}
            </Text>
          ) : (
            <>
              <View className="gap-xs">
                <Text
                  accessibilityRole="header"
                  className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
                >
                  {resolveSurveyCopy(survey.title, language)}
                </Text>
                <Text
                  testID="survey-results-counts"
                  className={`text-start text-md tabular-nums text-neutral-700 ${fontClass}`}
                >
                  {[
                    t('responsesCount', { count: survey.responseCount }),
                    t('completedCount', { count: results.responseCount }),
                  ].join(' · ')}
                </Text>
              </View>
              <PressableScale
                testID="survey-export-csv"
                accessibilityRole="button"
                accessibilityLabel={tExport('admin:exportShare')}
                onPress={() => {
                  setExportNotice(null);
                  exportCsv.mutate(survey, {
                    onSuccess: (rows) => {
                      playHaptic('success');
                      setExportNotice({
                        ok: true,
                        text: tExport('admin:exportShared', { count: rows }),
                      });
                    },
                    onError: (error) => {
                      playHaptic('error');
                      setExportNotice({
                        ok: false,
                        text:
                          toAppError(error).code === 'AUTH-9'
                            ? tExport('errors:AUTH-9')
                            : tExport('admin:exportFailed'),
                      });
                    },
                  });
                }}
                isBusy={exportCsv.isPending}
                isDisabled={exportCsv.isPending}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center self-start rounded-md border border-neutral-300 bg-white px-lg"
              >
                <Text className={`text-center text-md font-semibold text-neutral-900 ${fontClass}`}>
                  {tExport('admin:exportShare')}
                </Text>
              </PressableScale>
              {exportNotice === null ? null : (
                <Text
                  testID="survey-export-notice"
                  accessibilityLiveRegion="polite"
                  className={`text-start text-md ${exportNotice.ok ? 'text-success' : 'text-error'} ${fontClass}`}
                >
                  {exportNotice.text}
                </Text>
              )}
              {responses.isError ? (
                <Text className={`text-start text-md text-error ${fontClass}`}>
                  {t('loadError')}
                </Text>
              ) : responses.data === undefined ? (
                <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                  {t('loadingResponses')}
                </Text>
              ) : (
                <>
                  {questions.map((question) => (
                    <View key={question.id} testID={`survey-result-${question.id}`}>
                      <Section title={resolveSurveyCopy(question.prompt, language)}>
                        {resultFor(question)}
                      </Section>
                    </View>
                  ))}
                  <Section title={t('individualResponses')}>
                    {responses.data.length === 0 ? (
                      <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                        {t('noResponses')}
                      </Text>
                    ) : (
                      responses.data.map((response) => (
                        <View
                          key={response.id}
                          testID={`survey-response-${response.id}`}
                          className="flex-row flex-wrap items-center justify-between gap-sm"
                        >
                          <Text
                            className={`flex-1 text-start text-md text-neutral-900 ${fontClass}`}
                          >
                            {response.playerName}
                          </Text>
                          <Text className={`text-sm font-semibold text-neutral-700 ${fontClass}`}>
                            {t(response.status)}
                          </Text>
                        </View>
                      ))
                    )}
                  </Section>
                </>
              )}
            </>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
