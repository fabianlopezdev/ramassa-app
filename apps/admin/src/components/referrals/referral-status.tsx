import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import type { Referral } from '@ramassa/shared/referrals';

export function ReferralStatus({ status }: Pick<Referral, 'status'>) {
  const { t } = useTranslation('referrals');
  return (
    <Badge
      variant={status === 'inactive' ? 'outline' : status === 'pending' ? 'secondary' : 'default'}
    >
      {t(`status.${status}`)}
    </Badge>
  );
}
