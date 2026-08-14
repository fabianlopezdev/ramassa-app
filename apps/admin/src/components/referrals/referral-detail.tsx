import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchReferralUpdates,
  REFERRAL_UPDATE_TYPES,
  referralUpdateSchema,
  submitReferralUpdate,
  type Referral,
  type ReferralUpdateEntry,
} from '@ramassa/shared/referrals';
import { ReferralStatus } from './referral-status';

export function ReferralDetail({
  referral,
  initialUpdates,
}: {
  readonly referral: Referral;
  readonly initialUpdates: readonly ReferralUpdateEntry[];
}) {
  const { t, i18n } = useTranslation('referrals');
  const locale = i18n.resolvedLanguage ?? 'ca';
  const [updateType, setUpdateType] = useState<(typeof REFERRAL_UPDATE_TYPES)[number]>('other');
  const [content, setContent] = useState('');
  const [updates, setUpdates] = useState(initialUpdates);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function addUpdate() {
    const parsed = referralUpdateSchema.safeParse({ updateType, content });
    if (!parsed.success) return;
    setSubmitting(true);
    setFailed(false);
    const result = await safeAsync(() => submitReferralUpdate(supabase, referral.id, parsed.data), {
      context: { operation: 'entity-referral-update', referralId: referral.id },
    });
    if (!result.ok) setFailed(true);
    else {
      setContent('');
      const refreshed = await safeAsync(() => fetchReferralUpdates(supabase, referral.id));
      if (refreshed.ok) setUpdates(refreshed.value);
    }
    setSubmitting(false);
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header>
        <Link
          to="/portal/referrals"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('back')}
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-start text-2xl font-semibold">
            {referral.referredFirstName} {referral.referredLastName}
          </h1>
          <ReferralStatus status={referral.status} />
        </div>
      </header>

      <section className="rounded-xl border bg-card p-5" aria-labelledby="referral-contact-title">
        <h2 id="referral-contact-title" className="text-start text-lg font-semibold">
          {t('contactTitle')}
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-start text-sm text-muted-foreground">{t('phone')}</dt>
            <dd className="text-start">{referral.referredPhone ?? '·'}</dd>
          </div>
          <div>
            <dt className="text-start text-sm text-muted-foreground">{t('email')}</dt>
            <dd className="text-start">{referral.referredEmail ?? '·'}</dd>
          </div>
          <div>
            <dt className="text-start text-sm text-muted-foreground">{t('documentationLabel')}</dt>
            <dd className="text-start">{t(`documentation.${referral.documentationStatus}`)}</dd>
          </div>
          <div>
            <dt className="text-start text-sm text-muted-foreground">{t('createdLabel')}</dt>
            <dd className="text-start">{new Date(referral.createdAt).toLocaleString(locale)}</dd>
          </div>
        </dl>
        {referral.notes === null ? null : (
          <p className="mt-4 whitespace-pre-wrap text-start text-sm">{referral.notes}</p>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5" aria-labelledby="referral-updates-title">
        <h2 id="referral-updates-title" className="text-start text-lg font-semibold">
          {t('updatesTitle')}
        </h2>
        {referral.status === 'pending' ? null : (
          <div className="mt-4 flex flex-col gap-3">
            <label htmlFor="referral-update-type" className="text-start text-sm font-medium">
              {t('updateType')}
            </label>
            <select
              id="referral-update-type"
              value={updateType}
              onChange={(event) =>
                setUpdateType(event.target.value as (typeof REFERRAL_UPDATE_TYPES)[number])
              }
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {REFERRAL_UPDATE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`updateTypes.${type}`)}
                </option>
              ))}
            </select>
            <label htmlFor="referral-update-content" className="text-start text-sm font-medium">
              {t('updateContent')}
            </label>
            <Textarea
              id="referral-update-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={4}
            />
            {failed ? (
              <p role="alert" className="text-start text-sm text-destructive">
                {t('updateError')}
              </p>
            ) : null}
            <Button
              type="button"
              size="lg"
              disabled={submitting || content.trim().length === 0}
              onClick={() => void addUpdate()}
              data-testid="referral-update-submit"
            >
              {t('updateSubmit')}
            </Button>
          </div>
        )}
        {updates.length === 0 ? (
          <p className="mt-5 text-start text-sm text-muted-foreground">{t('noUpdates')}</p>
        ) : (
          <ol className="mt-5 grid gap-3" data-testid="referral-update-list">
            {updates.map((update) => (
              <li key={update.id} className="rounded-lg bg-muted p-4">
                <div className="flex flex-wrap justify-between gap-3 text-sm">
                  <strong>{t(`updateTypes.${update.updateType}`)}</strong>
                  <time dateTime={update.createdAt}>
                    {new Date(update.createdAt).toLocaleString(locale)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-start">{update.content}</p>
                <p className="mt-2 text-start text-xs text-muted-foreground">{update.authorName}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
