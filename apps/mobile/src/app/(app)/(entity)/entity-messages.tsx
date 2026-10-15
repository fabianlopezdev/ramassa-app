/**
 * The partner entity's Messages tab on the phone (RAPP-415), as the web
 * portal's messages page: her one general conversation with the team
 * (`get_or_create_own_conversation` allows entity accounts), in the phone's
 * player thread with the entity title. The tab shows the unread count.
 */
import { PlayerMessageThread } from '@/components/messaging/message-thread';
import { useTranslation } from 'react-i18next';

export default function EntityMessagesScreen() {
  const { t } = useTranslation('messaging');
  return <PlayerMessageThread title={t('entityTitle')} />;
}
