/**
 * The partner entity's Messages tab on the phone (RAPP-415), as the web
 * portal's messages page: her one general conversation with the team
 * (`get_or_create_own_conversation` allows entity accounts), in the phone's
 * player thread with the entity title. The tab shows the unread count. The
 * settings button leads the header, as on every entity tab (RAPP-803).
 */
import { EntityAccountButton } from '@/components/entity/entity-account-menu';
import { PlayerMessageThread } from '@/components/messaging/message-thread';
import { withScreenEntrance } from '@/components/motion/screen-entrance';
import { useTranslation } from 'react-i18next';

function EntityMessagesScreen() {
  const { t } = useTranslation('messaging');
  return <PlayerMessageThread title={t('entityTitle')} headerAccessory={<EntityAccountButton />} />;
}

export default withScreenEntrance('entity-messages', EntityMessagesScreen);
