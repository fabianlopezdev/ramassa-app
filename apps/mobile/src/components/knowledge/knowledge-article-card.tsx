import { Badge } from '@/components/layout/badge';
import { RaisedCard } from '@/components/layout/raised-card';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import type { KnowledgeArticleListRow, KnowledgeContentType } from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

const imageStyle = { height: tokens.contentWidth.form / 3, width: '100%' } as const;

function typeTranslationKey(contentType: KnowledgeContentType) {
  if (contentType === 'tutorial') return 'knowledge:typeTutorial' as const;
  if (contentType === 'video') return 'knowledge:typeVideo' as const;
  if (contentType === 'external_link') return 'knowledge:typeExternalLink' as const;
  if (contentType === 'participant_story') return 'knowledge:typeParticipantStory' as const;
  return 'knowledge:typeArticle' as const;
}

/**
 * A guide or a story as the shared raised card (RAPP-852): its cover across
 * the top, its category and type, its title and author. Comunitat's stories
 * and Ajuda's guides share it.
 */
export const KnowledgeArticleCard = memo(function KnowledgeArticleCard({
  article,
  accessToken,
  onOpen,
  compact = false,
}: {
  readonly article: KnowledgeArticleListRow;
  readonly accessToken: string | undefined;
  readonly onOpen: (id: string) => void;
  /** Without the cover image, for short lists above other content. */
  readonly compact?: boolean;
}) {
  const { t } = useTranslation('knowledge');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const title = resolveLocalizedText(article.title, language);
  const category = resolveLocalizedText(article.category.name, language);
  const imageSource = useMemo(
    () =>
      compact
        ? null
        : resolveMediaImageSource({
            objectKeyOrUrl: article.image_url,
            mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
            accessToken,
          }),
    [accessToken, article.image_url, compact],
  );
  const handlePress = useCallback(() => onOpen(article.id), [article.id, onOpen]);
  if (title === undefined || category === undefined) return null;

  const type = t(typeTranslationKey(article.content_type));
  const attribution =
    article.author_first_name === null
      ? null
      : t('knowledge:byAuthor', { name: article.author_first_name });
  return (
    <RaisedCard
      testID={`knowledge-article-${article.id}`}
      accessibilityLabel={[title.text, category.text, type, attribution].filter(Boolean).join('. ')}
      onOpen={handlePress}
      media={
        imageSource === null ? null : (
          <Image
            source={imageSource}
            accessibilityLabel={title.text}
            cachePolicy="memory-disk"
            contentFit="cover"
            recyclingKey={article.id}
            style={imageStyle}
          />
        )
      }
    >
      <View className="flex-row flex-wrap gap-xs">
        <Badge label={category.text} tone="brandSoft" languageFontClass={languageFontClass} />
        <Badge label={type} languageFontClass={languageFontClass} />
      </View>
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
      >
        {title.text}
      </Text>
      {attribution === null ? null : (
        <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
          {attribution}
        </Text>
      )}
    </RaisedCard>
  );
});
