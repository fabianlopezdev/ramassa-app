/**
 * A partner-entity contact (RAPP-232). Her portal stays on the web until the
 * native entity experience (RAPP-217); she never lands in the player tabs.
 */
import { AccountNoticeScreen } from '@/components/auth/account-notice-screen';
import { useTranslation } from 'react-i18next';

export default function EntityPortalScreen() {
  const { t } = useTranslation('auth');
  return (
    <AccountNoticeScreen
      testID="entity-portal-notice"
      title={t('entityPortalTitle')}
      body={t('entityPortalBody')}
    />
  );
}
