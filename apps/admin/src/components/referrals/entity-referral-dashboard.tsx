import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { filterReferrals, type Referral } from '@ramassa/shared/referrals';
import { ReferralStatus } from './referral-status';

export function EntityReferralDashboard({
  referrals,
  search,
  onSearchChange,
}: {
  readonly referrals: readonly Referral[];
  readonly search: string;
  readonly onSearchChange: (search: string) => void;
}) {
  const { t, i18n } = useTranslation('referrals');
  const locale = i18n.resolvedLanguage ?? 'ca';
  const visibleReferrals = useMemo(() => filterReferrals(referrals, search), [referrals, search]);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-start text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-start text-sm text-muted-foreground">{t('intro')}</p>
        </div>
        <Button asChild size="lg" data-testid="referral-new">
          <Link to="/portal/referrals/new">{t('newAction')}</Link>
        </Button>
      </header>

      {referrals.length === 0 ? null : (
        <div className="max-w-xl">
          <label htmlFor="referral-search" className="text-start text-sm font-medium">
            {t('searchLabel')}
          </label>
          <Input
            id="referral-search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="mt-1.5"
            data-testid="referral-search"
          />
        </div>
      )}

      {referrals.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-medium">{t('emptyTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('emptyBody')}</p>
        </div>
      ) : visibleReferrals.length === 0 ? (
        <p
          className="rounded-xl border border-dashed p-8 text-start text-muted-foreground"
          data-testid="referral-search-empty"
        >
          {t('searchEmpty')}
        </p>
      ) : (
        <ul className="grid gap-4" data-testid="entity-referral-list">
          {visibleReferrals.map((referral) => (
            <li
              key={referral.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"
              data-testid={`entity-referral-row-${referral.id}`}
            >
              <div className="min-w-0">
                <p className="text-start font-medium">
                  {referral.referredFirstName} {referral.referredLastName}
                </p>
                <p className="mt-1 text-start text-sm text-muted-foreground">
                  {new Date(referral.createdAt).toLocaleDateString(locale)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <ReferralStatus status={referral.status} />
                <Button asChild variant="outline">
                  <Link to="/portal/referrals/$referralId" params={{ referralId: referral.id }}>
                    {t('open')}
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
