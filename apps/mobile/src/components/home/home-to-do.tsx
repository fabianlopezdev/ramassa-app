/**
 * Per fer on Inici (RAPP-790): the first thing waiting for her, one card at a
 * time, with "1 de 2" when more wait. Answering or putting off the card shows
 * the next one. Nothing waiting: the block is not rendered.
 */

import { PendingFormPrompt } from '@/components/forms/pending-form-prompt';
import { HomeSectionHeader } from '@/components/home/home-section-header';
import { SurveyPromptCard } from '@/components/surveys/survey-prompt';
import type { HomeToDoItem } from '@/lib/home-to-do';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

interface HomeToDoProps {
  readonly items: readonly HomeToDoItem[];
  readonly languageFontClass: string;
}

export function HomeToDo({ items, languageFontClass }: HomeToDoProps) {
  const { t } = useTranslation('home');
  const current = items[0];
  if (current === undefined) return null;
  const count = items.length > 1 ? t('toDo.count', { current: 1, total: items.length }) : undefined;

  return (
    <View testID="home-to-do" className="gap-sm">
      <HomeSectionHeader
        title={t('toDo.title')}
        trailing={count}
        languageFontClass={languageFontClass}
      />
      {current.kind === 'form' ? (
        <PendingFormPrompt key={current.key} form={current.form} />
      ) : (
        <SurveyPromptCard key={current.key} survey={current.survey} />
      )}
    </View>
  );
}
