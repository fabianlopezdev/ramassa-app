/**
 * A survey on the form engine waiting for her (RAPP-929), as a row of Per fer
 * on Inici: its name, when it closes, and a tap opens it
 * (`/survey-form/[responseId]`). The same row her forms and the older surveys
 * use (`ToDoRow`).
 */
import { ToDoRow } from '@/components/home/to-do-row';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, useLanguage } from '@ramassa/shared/i18n';
import { textIn, type MySurvey } from '@ramassa/shared/intake-builder';

export function SurveyFormPrompt({ survey }: { readonly survey: MySurvey }) {
  const { t, i18n } = useTranslation(['surveys', 'home']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        day: 'numeric',
        month: 'long',
      }),
    [i18n.resolvedLanguage],
  );
  const open = useCallback(
    () => push(`/survey-form/${survey.responseId}` as Href),
    [push, survey.responseId],
  );
  const title = textIn(survey.name, language);
  const actionLabel = t('promptAction');
  return (
    <ToDoRow
      testID="survey-form-prompt"
      title={title}
      detail={
        survey.closesAt === null
          ? undefined
          : t('closes', { date: dateFormatter.format(new Date(survey.closesAt)) })
      }
      accessibilityLabel={`${actionLabel}: ${title}`}
      markLabel={t('home:unseen')}
      isStarted={false}
      languageFontClass={languageFontClass}
      onOpen={open}
    />
  );
}
