import { KnowledgeArticleCard } from '@/components/knowledge/knowledge-article-card';
import { PageWidth } from '@/components/layout/content-width';
import { selectBaseDocuments } from '@/lib/player-guides';
import { usePlayerKnowledgeArticles } from '@/lib/player-knowledge';
import { type Href } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';

/**
 * The Documents view of the Ajuda tab (RAPP-972): the club's base documents,
 * such as the safeguarding protocol and the code of conduct, written with the
 * guides editor in the club's base-documents category. Each opens like a
 * guide. The tab only offers the view once one is published, and draws it
 * under its own header inside its one scrolling page (RAPP-977).
 */
export function PlayerBaseDocumentList() {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const articlesQuery = usePlayerKnowledgeArticles();
  const documents = useMemo(() => selectBaseDocuments(articlesQuery.data), [articlesQuery.data]);

  return (
    <PageWidth>
      <View className="gap-md">
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
      </View>
    </PageWidth>
  );
}
