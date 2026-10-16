/**
 * Today's forum reports section (RAPP-380): how many reported posts, replies
 * and photos wait, one tap to the moderation screen.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useForumModerationQueue } from '@/lib/team-forum';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

export function TodayForumCard() {
  const { t } = useTranslation('forum');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const waiting = useForumModerationQueue().data?.length ?? 0;
  const detail = waiting > 0 ? t('moderationCount', { count: waiting }) : t('moderationEmptyTitle');
  return (
    <PressableScale
      testID="today-forum"
      accessibilityRole="button"
      accessibilityLabel={`${t('moderationTitle')}, ${detail}`}
      onPress={() => push('/forum-moderation' as Href)}
      haptic="selection"
      style={continuousCorners}
      className="min-h-recommended justify-center gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
    >
      <Text className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}>
        {t('moderationTitle')}
      </Text>
      <Text
        className={`text-start text-md ${
          waiting > 0 ? 'font-semibold text-primary-dark' : 'text-neutral-600'
        } ${languageFontClass}`}
      >
        {detail}
      </Text>
    </PressableScale>
  );
}
