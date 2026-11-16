import { PlayerMessageThread } from '@/components/messaging/message-thread';
import { useTranslation } from 'react-i18next';

export default function TeamChatScreen() {
  const { t } = useTranslation('messaging');
  return <PlayerMessageThread title={t('playerTitle')} usesNativeHeader />;
}
