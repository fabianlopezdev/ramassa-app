/**
 * One survey's results on the phone (RAPP-384), for `surveys.results`
 * holders, as the web admin's results: per question the stars' average and
 * spread, how often each choice and each of yes and no was picked, and the
 * written answers with who wrote them; then each participant's response and
 * whether it is complete. Answers are attributed, so they stay in memory.
 * Share CSV (RAPP-402) asks for the step-up, the database records the export,
 * and the file goes to the share sheet.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ScreenSection } from '@/components/layout/screen-section';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useStaffSurveys, useSurveyExport, useSurveyResponses } from '@/lib/team-surveys';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
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

export default function TeamSurveyResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation('surveys');
  const fontClass = useLanguageFontClass();
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
      edges={['left', 'right']}
    >
      <NativeScreenHeader
        title={survey === undefined ? undefined : resolveSurveyCopy(survey.title, language)}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          {survey === undefined ? (
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {surveys.isError ? t('loadError') : t('loadingResponses')}
            </Text>
          ) : (
            <>
              <View className="gap-xs">
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
              <RaisedActionButton
                testID="survey-export-csv"
                size="compact"
                label={tExport('admin:exportShare')}
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
                isDisabled={exportCsv.isPending || exportCsv.isPending}
              />
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
                      <ScreenSection title={resolveSurveyCopy(question.prompt, language)}>
                        {resultFor(question)}
                      </ScreenSection>
                    </View>
                  ))}
                  <ScreenSection title={t('individualResponses')} isLast>
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
                  </ScreenSection>
                </>
              )}
            </>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
