/**
 * One announcement as a player sees it: category, pinned, title, date, image
 * and body, in the reader's language. The player screen draws a stored
 * announcement with it, and the team's editor draws its unsaved draft with it
 * (RAPP-373), so the preview is the player's own layout.
 */
import { announcementCategoryLabel } from '@/components/announcements/category-filters';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { composeContinuousViewStyle } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image, type ImageSource } from 'expo-image';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import type { AnnouncementCategory } from '@ramassa/shared/announcements';
import { resolveLocalizedText, useLanguage, type LocalizedContent } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  imageFrame: {
    width: '100%',
    height: tokens.contentWidth.form / 2,
  },
  image: { width: '100%', height: '100%' },
});
const imageFrameStyle = composeContinuousViewStyle(styles.imageFrame);

export interface AnnouncementArticleContent {
  readonly category: AnnouncementCategory;
  readonly isPinned: boolean;
  readonly title: LocalizedContent;
  readonly body: LocalizedContent;
  readonly imageAlt: LocalizedContent | null;
  /** The date players read: when it is published. */
  readonly shownAt: string;
}

export function AnnouncementArticle({
  announcement,
  imageSource,
}: {
  readonly announcement: AnnouncementArticleContent;
  readonly imageSource: ImageSource | null;
}) {
  const { t, i18n } = useTranslation(['home', 'common']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const title = resolveLocalizedText(announcement.title, language);
  const body = resolveLocalizedText(announcement.body, language);
  const imageAlt =
    announcement.imageAlt === null
      ? undefined
      : resolveLocalizedText(announcement.imageAlt, language);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', { dateStyle: 'long' }),
    [i18n.resolvedLanguage],
  );

  return (
    <FadeSlideIn index={0}>
      <View className="gap-md">
        <View className="flex-row flex-wrap items-center gap-sm">
          <View className="rounded-full bg-neutral-100 px-sm py-xs">
            <Text className={`text-sm font-medium text-neutral-700 ${languageFontClass}`}>
              {announcementCategoryLabel(announcement.category, t)}
            </Text>
          </View>
          {announcement.isPinned ? (
            <View className="rounded-full bg-secondary px-sm py-xs">
              <Text className={`text-sm font-semibold text-neutral-900 ${languageFontClass}`}>
                {t('pinned')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          accessibilityRole="header"
          className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
        >
          {title?.text ?? ''}
        </Text>
        <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
          {dateFormatter.format(new Date(announcement.shownAt))}
        </Text>
        {imageSource === null ? null : (
          <View className="overflow-hidden rounded-lg" style={imageFrameStyle}>
            <Image
              source={imageSource}
              accessible={imageAlt !== undefined}
              accessibilityLabel={imageAlt?.text}
              cachePolicy="memory-disk"
              contentFit="cover"
              style={styles.image}
            />
          </View>
        )}
        <Text className={`text-start text-lg text-neutral-800 ${languageFontClass}`}>
          {body?.text ?? ''}
        </Text>
      </View>
    </FadeSlideIn>
  );
}
