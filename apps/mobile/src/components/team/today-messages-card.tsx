/**
 * Today's messages section (RAPP-246): the unread count, one tap to the
 * conversations.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useUnreadMessages } from '@/lib/messaging';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

export function TodayMessagesCard() {
  const { t } = useTranslation('messaging');
  const languageFontClass = useLanguageFontClass();
  const { navigate } = useRouter();
  const unread = useUnreadMessages().data ?? 0;
  const detail = unread > 0 ? t('unread', { count: unread }) : t('noUnread');
  return (
    <PressableScale
      testID="today-messages"
      accessibilityRole="button"
      accessibilityLabel={`${t('managementTitle')}, ${detail}`}
      onPress={() => navigate('/messages' as Href)}
      haptic="selection"
      style={continuousCorners}
      className="min-h-recommended justify-center gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
    >
      <Text className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}>
        {t('managementTitle')}
      </Text>
      <Text
        className={`text-start text-md ${
          unread > 0 ? 'font-semibold text-primary-dark' : 'text-neutral-600'
        } ${languageFontClass}`}
      >
        {detail}
      </Text>
    </PressableScale>
  );
}
