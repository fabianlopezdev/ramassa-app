import { KnowledgeArticleCard } from '@/components/knowledge/knowledge-article-card';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { selectLatestPlayerGuides } from '@/lib/player-guides';
import { usePlayerKnowledgeArticles } from '@/lib/player-knowledge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { tokens } from '@ramassa/shared/tokens';

const allGuidesSymbol: SymbolViewProps['name'] = {
  ios: 'book.closed.fill',
  android: 'menu_book',
  web: 'menu_book',
};

/** The Ajuda tab's "Guies" section: the latest guides and the door to all of them. */
export function LatestGuidesSection() {
  const { t } = useTranslation('knowledge');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { session } = useAuth();
  const articlesQuery = usePlayerKnowledgeArticles();
  const latestGuides = useMemo(
    () => selectLatestPlayerGuides(articlesQuery.data),
    [articlesQuery.data],
  );
  const openGuide = useCallback((id: string) => push(`/knowledge/${id}` as Href), [push]);
  const openAllGuides = useCallback(() => push('/knowledge' as Href), [push]);

  return (
    <View testID="ajuda-guides-section" className="gap-sm">
      <Text
        accessibilityRole="header"
        className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
      >
        {t('knowledge:guidesTitle')}
      </Text>
      {latestGuides.map((guide) => (
        <KnowledgeArticleCard
          key={guide.id}
          article={guide}
          accessToken={session?.access_token}
          onOpen={openGuide}
          compact
        />
      ))}
      <PressableScale
        testID="ajuda-all-guides"
        accessibilityRole="button"
        accessibilityLabel={t('knowledge:allGuides')}
        onPress={openAllGuides}
        haptic="tapLight"
        style={continuousCorners}
        className="min-h-recommended flex-row items-center justify-center gap-sm rounded-md border border-primary px-lg"
      >
        <SymbolView
          accessible={false}
          name={allGuidesSymbol}
          size={tokens.fontSize.xl}
          tintColor={tokens.colors.primary.dark}
        />
        <Text className={`text-md font-bold text-primary-dark ${languageFontClass}`}>
          {t('knowledge:allGuides')}
        </Text>
      </PressableScale>
    </View>
  );
}
