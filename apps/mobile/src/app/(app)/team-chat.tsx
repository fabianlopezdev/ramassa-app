import { PlayerMessageThread } from '@/components/messaging/message-thread';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

export default function TeamChatScreen() {
  const { back } = useRouter();
  const { t } = useTranslation(['messaging', 'common']);
  const languageFontClass = useLanguageFontClass();
  return (
    <PlayerMessageThread
      title={t('messaging:playerTitle')}
      headerAccessory={
        <PressableScale
          testID="team-chat-back"
          accessibilityLabel={t('common:back')}
          onPress={back}
          haptic="tapLight"
          className="min-h-recommended justify-center px-sm"
        >
          <Text className={`font-semibold text-primary-dark ${languageFontClass}`}>
            {t('common:back')}
          </Text>
        </PressableScale>
      }
    />
  );
}
