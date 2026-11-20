import { ToDoRow } from '@/components/home/to-do-row';
import { usePlayerSurveys } from '@/lib/player-surveys';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@ramassa/shared/i18n';
import { resolveSurveyCopy, type PlayerSurvey } from '@ramassa/shared/surveys';

export function EventSurveyPrompt({ eventId }: { readonly eventId: string }) {
  const { data } = usePlayerSurveys();
  const survey = useMemo(
    () => data?.find((item) => item.responseStatus !== 'completed' && item.eventId === eventId),
    [data, eventId],
  );
  return <SurveyPromptCard survey={survey} />;
}

export function SurveyPromptCard({ survey }: { readonly survey: PlayerSurvey | undefined }) {
  const { t } = useTranslation(['surveys', 'home']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const surveyId = survey?.id;
  const open = useCallback(() => {
    if (surveyId !== undefined) push(`/survey/${surveyId}` as Href);
  }, [push, surveyId]);
  if (survey === undefined) return null;
  const title = resolveSurveyCopy(survey.title, language);
  // Her saved answers reopen with the survey, so a started one says so (RAPP-825).
  const isStarted = survey.responseStatus === 'in_progress';
  const actionLabel = isStarted ? t('promptStarted') : t('promptAction');
  return (
    <ToDoRow
      testID="survey-prompt-action"
      title={title}
      accessibilityLabel={`${actionLabel}: ${title}`}
      markLabel={isStarted ? actionLabel : t('home:unseen')}
      isStarted={isStarted}
      languageFontClass={languageFontClass}
      onOpen={open}
    />
  );
}
