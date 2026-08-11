import { StaffMessageThread } from '@/components/messaging/message-thread';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function StaffConversationScreen() {
  const { conversationId = '' } = useLocalSearchParams<{ conversationId: string }>();
  const { t } = useTranslation('messaging');
  return <StaffMessageThread conversationId={conversationId} title={t('staffTitle')} />;
}
