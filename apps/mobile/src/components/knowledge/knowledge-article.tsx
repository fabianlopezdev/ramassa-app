/**
 * One knowledge resource as a player sees it: category, title, author, cover,
 * the block body with its video, a story's photos and the external link, in
 * the reader's language. The player screen draws a stored resource with it,
 * and the team's editor draws its unsaved draft with it (RAPP-373), so the
 * preview is the player's own layout.
 */
import { PlayerStructuredContent } from '@/components/knowledge/player-structured-content';
import { PressableScale } from '@/components/motion/pressable-scale';
import { AuthorLine } from '@/components/people/person-avatar';
import { composeContinuousViewStyle, continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { resolveLocalizedText, useLanguage, type LocalizedContent } from '@ramassa/shared/i18n';
import {
  resolveLocalizedKnowledgeBlocks,
  type LocalizedKnowledgeBody,
} from '@ramassa/shared/knowledge';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  imageFrame: { width: '100%', height: tokens.contentWidth.form / 2 },
  image: { width: '100%', height: '100%' },
});
const imageFrameStyle = composeContinuousViewStyle(styles.imageFrame);

export interface KnowledgeArticleContent {
  readonly title: LocalizedContent;
  readonly categoryName: LocalizedContent;
  readonly authorFirstName: string | null;
  /** The team author's photo (RAPP-639); a story's author shows her initial. */
  readonly authorAvatarKey?: string | null;
  readonly body: LocalizedKnowledgeBody;
  readonly imageUrl: string | null;
  readonly videoUrl: string | null;
  readonly externalUrl: string | null;
  readonly storyImageUrls: readonly string[];
}

export function KnowledgeArticle({
  article,
  accessToken,
  onOpenExternal,
}: {
  readonly article: KnowledgeArticleContent;
  readonly accessToken: string | undefined;
  readonly onOpenExternal: () => void;
}) {
  const { t } = useTranslation(['knowledge', 'common']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const title = resolveLocalizedText(article.title, language)?.text ?? '';
  const category = resolveLocalizedText(article.categoryName, language)?.text ?? '';
  const body = resolveLocalizedKnowledgeBlocks(article.body, language);
  const coverSource = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: article.imageUrl,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, article.imageUrl],
  );
  const storyImageSources = useMemo(
    () =>
      article.storyImageUrls.flatMap((objectKey) => {
        const source = resolveMediaImageSource({
          objectKeyOrUrl: objectKey,
          mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
          accessToken,
        });
        return source === null ? [] : [{ key: objectKey, source }];
      }),
    [accessToken, article.storyImageUrls],
  );

  return (
    <View className="gap-lg">
      <View className="gap-sm">
        <Text className={`text-start text-sm font-semibold text-primary-dark ${languageFontClass}`}>
          {category}
        </Text>
        <Text
          accessibilityRole="header"
          className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
        >
          {title}
        </Text>
        {article.authorFirstName === null ? null : (
          <View className="pt-xs">
            <AuthorLine
              name={article.authorFirstName}
              avatarKey={article.authorAvatarKey ?? null}
              label={t('knowledge:byAuthor', { name: article.authorFirstName })}
              languageFontClass={languageFontClass}
              size="medium"
              textClassName="text-sm font-semibold text-neutral-700"
            />
          </View>
        )}
      </View>
      {coverSource === null ? null : (
        <View className="overflow-hidden rounded-lg" style={imageFrameStyle}>
          <Image
            source={coverSource}
            accessibilityLabel={title}
            cachePolicy="memory-disk"
            contentFit="cover"
            style={styles.image}
          />
        </View>
      )}
      {body === undefined ? null : (
        <PlayerStructuredContent
          blocks={body.blocks}
          videoUrl={article.videoUrl}
          title={title}
          accessToken={accessToken}
          unavailableLabel={t('knowledge:contentUnavailable')}
        />
      )}
      {storyImageSources.map(({ key, source }, index) => (
        <View key={key} className="overflow-hidden rounded-md" style={imageFrameStyle}>
          <Image
            source={source}
            accessibilityLabel={t('knowledge:storyPhoto', { number: index + 1, title })}
            cachePolicy="memory-disk"
            contentFit="cover"
            style={styles.image}
          />
        </View>
      ))}
      {article.externalUrl === null ? null : (
        <PressableScale
          accessibilityRole="link"
          accessibilityLabel={t('knowledge:openExternalResource')}
          onPress={onOpenExternal}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`text-md font-bold text-white ${languageFontClass}`}>
            {t('knowledge:openExternalResource')}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}
