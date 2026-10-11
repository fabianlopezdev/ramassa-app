/**
 * A team member whose permissions open none of the team screens the app has in
 * this phase (RAPP-232). The web dashboard has everything she may do.
 */
import { AccountNoticeScreen } from '@/components/auth/account-notice-screen';
import { useTranslation } from 'react-i18next';

export default function TeamHomeScreen() {
  const { t } = useTranslation('auth');
  return (
    <AccountNoticeScreen
      testID="team-home-notice"
      title={t('teamHomeTitle')}
      body={t('teamHomeBody')}
    />
  );
}
