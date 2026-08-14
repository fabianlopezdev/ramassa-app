import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Referral } from '@ramassa/shared/referrals';

export function StaffReferralQueue({ referrals }: { readonly referrals: readonly Referral[] }) {
  const { t, i18n } = useTranslation('referrals');
  const locale = i18n.resolvedLanguage ?? 'ca';

  return (
    <section className="flex flex-col gap-6 p-6">
      <header>
        <Link to="/participants" className="text-sm text-muted-foreground hover:text-foreground">
          {t('back')}
        </Link>
        <h1 className="mt-3 text-start text-2xl font-semibold">{t('staffQueueTitle')}</h1>
        <p className="mt-1 text-start text-sm text-muted-foreground">{t('staffQueueIntro')}</p>
      </header>
      {referrals.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-start text-muted-foreground">
          {t('emptyTitle')}
        </p>
      ) : (
        <ul className="grid gap-4" data-testid="staff-referral-queue">
          {referrals.map((referral) => (
            <li key={referral.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-start font-semibold">
                    {referral.referredFirstName} {referral.referredLastName}
                  </h2>
                  <p className="mt-1 text-start text-sm text-muted-foreground">
                    {referral.entityName ?? '·'} ·{' '}
                    {new Date(referral.createdAt).toLocaleDateString(locale)}
                  </p>
                  <p className="mt-3 text-start text-sm">
                    {[referral.referredPhone, referral.referredEmail].filter(Boolean).join(' · ')}
                  </p>
                  {referral.notes === null ? null : (
                    <p className="mt-2 whitespace-pre-wrap text-start text-sm">{referral.notes}</p>
                  )}
                </div>
                <Button asChild size="lg">
                  <Link
                    to="/participants/new"
                    search={{ referral: referral.id }}
                    data-testid={`complete-referral-${referral.id}`}
                  >
                    {t('completeAction')}
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
