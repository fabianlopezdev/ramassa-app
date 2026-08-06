import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const knowledgeSymbol: SymbolViewProps['name'] = {
  ios: 'book.closed.fill',
  android: 'menu_book',
  web: 'menu_book',
};
const storySymbol: SymbolViewProps['name'] = {
  ios: 'square.and.pencil',
  android: 'edit_note',
  web: 'edit_note',
};

interface QuickActionProps {
  readonly title: string;
  readonly body: string;
  readonly symbol: SymbolViewProps['name'];
  readonly testID: string;
  readonly languageFontClass: string;
  readonly onPress: () => void;
}

function QuickAction({
  title,
  body,
  symbol,
  testID,
  languageFontClass,
  onPress,
}: QuickActionProps) {
  return (
    <PressableScale
      testID={testID}
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      haptic="tapLight"
      style={continuousCorners}
      className="min-h-recommended flex-1 gap-sm rounded-lg border border-neutral-200 bg-neutral-50 p-md"
    >
      <SymbolView
        name={symbol}
        size={tokens.fontSize['2xl']}
        tintColor={tokens.colors.primary.DEFAULT}
      />
      <Text className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}>
        {title}
      </Text>
      <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>{body}</Text>
    </PressableScale>
  );
}

export function KnowledgeQuickActions() {
  const { t } = useTranslation('knowledge');
  const languageFontClass = useLanguageFontClass();
  const router = useRouter();
  const openKnowledge = useCallback(() => router.push('/knowledge' as Href), [router]);
  const openStory = useCallback(() => router.push('/story/submit' as Href), [router]);

  return (
    <View className="flex-row gap-sm">
      <QuickAction
        title={t('knowledge:quickKnowledgeTitle')}
        body={t('knowledge:quickKnowledgeBody')}
        symbol={knowledgeSymbol}
        testID="open-knowledge-base"
        languageFontClass={languageFontClass}
        onPress={openKnowledge}
      />
      <QuickAction
        title={t('knowledge:quickStoryTitle')}
        body={t('knowledge:quickStoryBody')}
        symbol={storySymbol}
        testID="open-story-submission"
        languageFontClass={languageFontClass}
        onPress={openStory}
      />
    </View>
  );
}
