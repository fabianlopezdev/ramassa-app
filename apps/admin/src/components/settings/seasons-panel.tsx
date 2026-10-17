/**
 * The organization's seasons (RAPP-306): one is current. Publishing the
 * current season's authorization makes returning players register again, so
 * a new season is created first, then its authorization published below.
 */

import { Button } from '@/components/ui/button';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Season } from '@ramassa/shared/seasons';

export interface SeasonsPanelProps {
  readonly seasons: readonly Season[];
  readonly onCreate: (input: {
    readonly name: string;
    readonly startsOn: string;
    readonly makeCurrent: boolean;
  }) => Promise<void>;
  readonly onSetCurrent: (seasonId: string) => Promise<void>;
}

export function SeasonsPanel({ seasons, onCreate, onSetCurrent }: SeasonsPanelProps) {
  const { t, i18n } = useTranslation('settings');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setStatus('saving');
    try {
      await onCreate({
        name: String(fields.get('season-name') ?? ''),
        startsOn: String(fields.get('season-starts-on') ?? ''),
        makeCurrent: fields.get('season-make-current') === 'on',
      });
      form.reset();
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <section
      className="flex max-w-4xl flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="seasons-panel"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-start text-base font-semibold">{t('seasonsTitle')}</h3>
        <p className="text-start text-sm text-muted-foreground">{t('seasonsIntro')}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {seasons.map((season) => (
          <li key={season.id} className="flex flex-wrap items-center gap-3 text-start text-sm">
            <span className="font-medium">{season.name}</span>
            <span className="text-muted-foreground">
              {new Date(season.startsOn).toLocaleDateString(i18n.resolvedLanguage)}
            </span>
            {season.isCurrent ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {t('authorizationCurrentBadge')}
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onSetCurrent(season.id)}
              >
                {t('seasonSetCurrent')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => void create(event)}
        data-testid="season-create-form"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>{t('seasonName')}</span>
          <input
            id="season-name"
            name="season-name"
            required
            maxLength={50}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>{t('seasonStartsOn')}</span>
          <input
            id="season-starts-on"
            name="season-starts-on"
            type="date"
            required
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input id="season-make-current" name="season-make-current" type="checkbox" />
          <span>{t('seasonMakeCurrent')}</span>
        </label>
        <Button type="submit" disabled={status === 'saving'}>
          {t('seasonCreate')}
        </Button>
        {status === 'saved' ? (
          <p aria-live="polite" className="text-start text-sm text-muted-foreground">
            {t('seasonCreated')}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t('seasonCreateFailed')}
          </p>
        ) : null}
      </form>
    </section>
  );
}
