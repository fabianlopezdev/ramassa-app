import { KnowledgeArticleCard } from '@/components/knowledge/knowledge-article-card';
import { PageWidth } from '@/components/layout/content-width';
import { isNetworkStateOnline } from '@/lib/network-status';
import { selectBaseDocuments } from '@/lib/player-guides';
import { usePlayerKnowledgeArticles } from '@/lib/player-knowledge';
import { useNetworkState } from 'expo-network';
import { type Href } from 'expo-router';
import { useCallback, useMemo, type ReactElement } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
});

/**
 * The Documents segment of the Ajuda tab (RAPP-972): the club's base
 * documents, such as the safeguarding protocol and the code of conduct,
 * written with the guides editor in the club's base-documents category. Each
 * opens like a guide. The tab only offers the segment once one is published,
 * and passes its header (title and segments) so it stays on screen.
 */
export function PlayerBaseDocumentList({
  header,
  contentContainerStyle,
}: {
  readonly header: ReactElement;
  readonly contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const isOnline = isNetworkStateOnline(useNetworkState());
  const articlesQuery = usePlayerKnowledgeArticles();
  const { refetch: refetchArticles } = articlesQuery;
  const documents = useMemo(() => selectBaseDocuments(articlesQuery.data), [articlesQuery.data]);
  const refresh = useCallback(() => void refetchArticles(), [refetchArticles]);

  return (
    <ScrollView
      testID="ajuda-base-documents"
      style={styles.screen}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={articlesQuery.isRefetching && isOnline} onRefresh={refresh} />
      }
    >
      <View className="gap-lg">
        {header}
        <PageWidth className="gap-md">
          {documents.map((document) => (
            <KnowledgeArticleCard
              key={document.id}
              article={document}
              accessToken={accessToken}
              href={`/knowledge/${document.id}` as Href}
              showsCategory={false}
              unseenLabel={null}
            />
          ))}
        </PageWidth>
      </View>
    </ScrollView>
  );
}
