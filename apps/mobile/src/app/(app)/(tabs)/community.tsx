import { MessageThread } from '@/components/messaging/message-thread';
import { useTranslation } from 'react-i18next';

export default function CommunityScreen() {
  const { t } = useTranslation('messaging');
  return <MessageThread title={t('playerTitle')} />;
}
