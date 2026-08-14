import { ReferralForm } from '@/components/referrals/referral-form';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_entity/portal/referrals/new')({
  ssr: false,
  component: ReferralForm,
});
