/**
 * Who has re-registered for the current season (RAPP-306).
 *
 * Every active player and whether she registered: signed in the app, on a
 * staff device or on paper. Staff filter the list, and with
 * notifications.send they remind the rest through the targeted notifications.
 * The reminder goes in every language she may read, from the app's own copy.
 */

import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import type { NotificationContent } from '@ramassa/shared/notifications';
import {
  filterRegistrations,
  type RegistrationFilter,
  type Season,
  type SeasonRegistration,
} from '@ramassa/shared/seasons';

export interface SeasonRegistrationsProps {
  readonly season: Season | null;
  readonly registrations: readonly SeasonRegistration[];
  readonly canRemind: boolean;
  readonly onRemind: (input: {
    readonly participantIds: readonly string[];
    readonly title: NotificationContent;
    readonly body: NotificationContent;
  }) => Promise<number>;
}

export function SeasonRegistrations({
  season,
  registrations,
  canRemind,
  onRemind,
}: SeasonRegistrationsProps) {
  const { t, i18n } = useTranslation('participants');
  const [filter, setFilter] = useState<RegistrationFilter>('all');
  const [result, setResult] = useState<{
    readonly kind: 'sent' | 'nobody' | 'failed';
    readonly count: number;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);

  if (season === null) {
    return (
      <section className="flex flex-col gap-3 p-6">
        <h1 className="text-start text-2xl font-semibold">{t('seasonViewHeading')}</h1>
        <p className="text-start text-sm text-muted-foreground">{t('seasonNoCurrent')}</p>
      </section>
    );
  }

  const pending = registrations.filter((row) => !row.registered);
  const shown = filterRegistrations(registrations, filter);
  const copy = (key: string, values: Record<string, string> = {}): NotificationContent =>
    Object.fromEntries(
      SUPPORTED_LANGUAGES.map((language) => [
        language,
        i18n.getFixedT(language, 'participants')(key, values),
      ]),
    ) as NotificationContent;

  async function remind() {
    if (season === null) return;
    setIsSending(true);
    setResult(null);
    try {
      const count = await onRemind({
        participantIds: pending.map((row) => row.profileId),
        title: copy('reminderNotificationTitle', { season: season.name }),
        body: copy('reminderNotificationBody', { season: season.name }),
      });
      setResult({ kind: count === 0 ? 'nobody' : 'sent', count });
    } catch {
      setResult({ kind: 'failed', count: 0 });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 p-6" data-testid="season-registrations">
      <header className="flex flex-col gap-1">
        <h1 className="text-start text-2xl font-semibold">
          {t('seasonViewTitle', { season: season.name })}
        </h1>
        <p className="text-start text-sm text-muted-foreground">
          {t('seasonViewSummary', {
            registered: registrations.length - pending.length,
            total: registrations.length,
          })}
        </p>
      </header>

      <label className="flex max-w-xs flex-col gap-1.5 text-sm font-medium">
        <span>{t('seasonFilterLabel')}</span>
        <select
          id="season-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as RegistrationFilter)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="all">{t('seasonFilterAll')}</option>
          <option value="registered">{t('seasonFilterRegistered')}</option>
          <option value="pending">{t('seasonFilterPending')}</option>
        </select>
      </label>

      {canRemind && pending.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
          <p className="text-start text-sm">{t('reminderIntro')}</p>
          <Button
            type="button"
            disabled={isSending}
            onClick={() => void remind()}
            data-testid="season-remind"
          >
            {t('reminderAction', { count: pending.length })}
          </Button>
          {result === null ? null : (
            <p
              aria-live="polite"
              className={
                result.kind === 'failed'
                  ? 'text-start text-sm text-destructive'
                  : 'text-start text-sm text-muted-foreground'
              }
            >
              {result.kind === 'sent'
                ? t('reminderSent', { count: result.count })
                : result.kind === 'nobody'
                  ? t('reminderNobody')
                  : t('reminderFailed')}
            </p>
          )}
        </div>
      ) : null}

      <ul
        className="flex flex-col divide-y rounded-xl border"
        data-testid="season-registration-list"
      >
        {shown.map((row) => (
          <li key={row.profileId} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <Link
              to="/participants/$participantId"
              params={{ participantId: row.profileId }}
              className="text-start text-sm font-medium underline-offset-2 hover:underline"
            >
              {row.name}
            </Link>
            <span
              className={
                row.registered
                  ? 'rounded bg-muted px-2 py-0.5 text-xs'
                  : 'rounded border border-destructive/40 px-2 py-0.5 text-xs text-destructive'
              }
            >
              {row.registered
                ? t('seasonRegistered', {
                    method: t(`authorizationMethod.${row.method ?? 'app'}`),
                    date:
                      row.signedAt === null
                        ? ''
                        : new Date(row.signedAt).toLocaleDateString(i18n.resolvedLanguage),
                  })
                : t('seasonPending')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
