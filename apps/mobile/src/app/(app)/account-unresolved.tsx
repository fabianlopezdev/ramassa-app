/**
 * The account could not be checked and this device remembers nothing for it
 * (RAPP-232): a retry, never the player tabs by default.
 */
import { AccountNoticeScreen } from '@/components/auth/account-notice-screen';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';

export default function AccountUnresolvedScreen() {
  const { t } = useTranslation('auth');
  const { refreshProfile } = useAuth();
  return (
    <AccountNoticeScreen
      testID="account-unresolved"
      title={t('accountUnresolvedTitle')}
      body={t('accountUnresolvedBody')}
      action={{ label: t('accountUnresolvedRetry'), onPress: () => void refreshProfile() }}
    />
  );
}
