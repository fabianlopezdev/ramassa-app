/**
 * Surveys on the phone (RAPP-384), for `surveys.manage` and `surveys.results`
 * holders, as the web admin's list: each survey with where it is in its life,
 * when it closes and how many answered. Managers start a new survey here;
 * results holders open a survey's attributed answers.
 */
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { RaisedCard } from '@/components/layout/raised-card';
import { ActionScreen } from '@/components/layout/screen-action';
import { teamScreens } from '@/lib/account-area';
import { continuousCorners } from '@/lib/continuous-corners';
import { surveyPhase, type SurveyPhase } from '@/lib/survey-phase';
import { useStaffSurveys } from '@/lib/team-surveys';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { resolveSurveyCopy, type StaffSurvey } from '@ramassa/shared/surveys';

const PHASE_KEYS: Readonly<Record<SurveyPhase, string>> = {
  scheduled: 'statusScheduled',
  open: 'statusOpen',
  closed: 'statusClosed',
};

function SurveyRow({
  survey,
  canOpen,
  format,
}: {
  readonly survey: StaffSurvey;
  readonly canOpen: boolean;
  readonly format: Intl.DateTimeFormat;
}) {
  const { t, i18n } = useTranslation('surveys');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const title = resolveSurveyCopy(survey.title, i18n.resolvedLanguage ?? DEFAULT_LANGUAGE);
  const content = (
    <View className="gap-xs">
      <View className="flex-row flex-wrap items-center justify-between gap-sm">
        <Text className={`flex-1 text-start text-md font-bold text-neutral-900 ${fontClass}`}>
          {title}
        </Text>
        <Text className={`text-sm font-semibold text-neutral-700 ${fontClass}`}>
          {t(PHASE_KEYS[surveyPhase(survey.publishedAt, survey.closesAt)])}
        </Text>
      </View>
      {survey.closesAt === null ? null : (
        <Text className={`text-start text-sm tabular-nums text-neutral-600 ${fontClass}`}>
          {t('closes', { date: format.format(new Date(survey.closesAt)) })}
        </Text>
      )}
      <Text className={`text-start text-sm tabular-nums text-neutral-700 ${fontClass}`}>
        {[
          t('responsesCount', { count: survey.responseCount }),
          t('completedCount', { count: survey.completedCount }),
        ].join(' · ')}
      </Text>
    </View>
  );
  const frame = 'rounded-md border border-neutral-200 bg-white p-md';
  if (!canOpen) {
    return (
      <View testID={`team-survey-${survey.id}`} style={continuousCorners} className={frame}>
        {content}
      </View>
    );
  }
  return (
    <RaisedCard
      testID={`team-survey-${survey.id}`}
      accessibilityLabel={`${title}, ${t('results')}`}
      onOpen={() => push(`/team-survey-results/${survey.id}` as Href)}
    >
      {content}
    </RaisedCard>
  );
}

export default function TeamSurveysScreen() {
  const { t, i18n } = useTranslation('surveys');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { permissions } = useAccountAccess();
  const team = teamScreens(permissions);
  const surveys = useStaffSurveys();
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );

  return (
    <SafeAreaView testID="team-surveys" className="flex-1 bg-neutral-50" edges={['left', 'right']}>
      <ActionScreen
        action={
          team.surveyEditor ? (
            <AuthSubmitButton
              testID="team-surveys-new"
              label={t('newSurvey')}
              onPress={() => push('/team-survey-new' as Href)}
            />
          ) : null
        }
      >
        <NativeScreenHeader title={t('title')} />
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
          <PageWidth className="gap-lg p-lg">
            <View className="gap-xs">
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('intro')}
              </Text>
            </View>
            {surveys.isError ? (
              <Text className={`text-start text-md text-error ${fontClass}`}>{t('loadError')}</Text>
            ) : surveys.data !== undefined && surveys.data.length === 0 ? (
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('noSurveys')}
              </Text>
            ) : (
              <View className="gap-sm">
                {(surveys.data ?? []).map((survey) => (
                  <SurveyRow
                    key={survey.id}
                    survey={survey}
                    canOpen={team.surveyResults}
                    format={format}
                  />
                ))}
              </View>
            )}
          </PageWidth>
        </ScrollView>
      </ActionScreen>
    </SafeAreaView>
  );
}
