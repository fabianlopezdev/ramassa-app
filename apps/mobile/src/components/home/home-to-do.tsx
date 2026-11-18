/**
 * Per fer on Inici (RAPP-790): everything waiting for her, each form and
 * survey in its own raised row, one under the other (RAPP-824, RAPP-827), so
 * the number on the Inici tab matches what she sees. Answering or putting off
 * an item removes its row. The forms she put off wait behind one quiet line at
 * the end (RAPP-865). Nothing waiting and nothing put off: the block is not
 * rendered.
 */

import { PendingFormPrompt } from '@/components/forms/pending-form-prompt';
import { HomeSection } from '@/components/home/home-section';
import { LaterFormsLink } from '@/components/home/later-forms-link';
import { SurveyPromptCard } from '@/components/surveys/survey-prompt';
import { useMyCustomFormsByPlace } from '@/lib/custom-forms';
import type { HomeToDoItem } from '@/lib/home-to-do';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

interface HomeToDoProps {
  readonly items: readonly HomeToDoItem[];
  readonly languageFontClass: string;
}

export function HomeToDo({ items, languageFontClass }: HomeToDoProps) {
  const { t } = useTranslation('home');
  const laterCount = useMyCustomFormsByPlace().later.length;
  if (items.length === 0 && laterCount === 0) return null;

  return (
    <HomeSection testID="home-to-do" title={t('toDo.title')} languageFontClass={languageFontClass}>
      <View className="gap-md">
        {items.map((item) =>
          item.kind === 'form' ? (
            <PendingFormPrompt key={item.key} form={item.form} />
          ) : (
            <SurveyPromptCard key={item.key} survey={item.survey} />
          ),
        )}
        <LaterFormsLink count={laterCount} languageFontClass={languageFontClass} />
      </View>
    </HomeSection>
  );
}
