/**
 * Per fer on Inici (RAPP-790): everything waiting for her, each form and
 * survey in its own card, one under the other (RAPP-824), so the number on the
 * Inici tab matches what she sees. Answering or putting off a card removes it.
 * Nothing waiting: the block is not rendered.
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
  if (items.length === 0) return null;

  return (
    <View testID="home-to-do" className="gap-sm">
      <HomeSectionHeader title={t('toDo.title')} languageFontClass={languageFontClass} />
      <View className="gap-md">
        {items.map((item) =>
          item.kind === 'form' ? (
            <PendingFormPrompt key={item.key} form={item.form} />
          ) : (
            <SurveyPromptCard key={item.key} survey={item.survey} />
          ),
        )}
      </View>
    </View>
  );
}
