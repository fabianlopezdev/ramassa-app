/**
 * Walk-ins waiting for review (RAPP-305): women who signed the authorization on
 * a staff tablet before they were in Ramassà. Each is not a participant yet.
 * Staff with participants.invite:
 *
 *   - confirm her with her email, after a recent second factor: her profile
 *     and invitation are created with her signed authorization attached;
 *   - merge her into a player who is already in Ramassà, who then has the
 *     signed authorization;
 *   - or discard the signing (a duplicate, a mistake).
 *
 * Her signing itself is never shown here: it holds her medical answer.
 */

import { Button } from '@/components/ui/button';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { WalkInSigning } from '@ramassa/shared/authorization';
import { getErrorMessageKey, isAppError } from '@ramassa/shared/errors';

export interface WalkInQueueProps {
  readonly walkIns: readonly WalkInSigning[];
  /** Players already in Ramassà, to merge a walk-in into. */
  readonly players: readonly { readonly profileId: string; readonly name: string }[];
  readonly onConfirm: (id: string, email: string) => Promise<void>;
  readonly onMerge: (id: string, profileId: string) => Promise<void>;
  readonly onDiscard: (id: string) => Promise<void>;
}

type Outcome = { readonly id: string; readonly kind: 'failed'; readonly messageKey: string };

/** Players whose name shares a word with hers come first. */
export function mergeCandidates(
  walkIn: WalkInSigning,
  players: WalkInQueueProps['players'],
): WalkInQueueProps['players'] {
  const words = new Set(
    `${walkIn.firstName} ${walkIn.lastName}`.toLocaleLowerCase().split(/\s+/).filter(Boolean),
  );
  const matches = (name: string) =>
    name
      .toLocaleLowerCase()
      .split(/\s+/)
      .some((word) => words.has(word));
  return [...players].sort((left, right) => {
    const byMatch = Number(matches(right.name)) - Number(matches(left.name));
    return byMatch !== 0 ? byMatch : left.name.localeCompare(right.name);
  });
}

export function WalkInQueue({ walkIns, players, onConfirm, onMerge, onDiscard }: WalkInQueueProps) {
  const { t, i18n } = useTranslation('participants');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setOutcome(null);
    try {
      await action();
    } catch (error) {
      setOutcome({
        id,
        kind: 'failed',
        messageKey: isAppError(error) ? getErrorMessageKey(error.code) : 'walkIns.failed',
      });
    } finally {
      setBusyId(null);
    }
  }

  function field(event: FormEvent<HTMLFormElement>, name: string): string {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get(name);
    return typeof value === 'string' ? value.trim() : '';
  }

  return (
    <section className="flex flex-col gap-4 p-6" data-testid="walk-in-queue">
      <header className="flex flex-col gap-1">
        <h1 className="text-start text-2xl font-semibold">{t('walkIns.title')}</h1>
        <p className="text-start text-sm text-muted-foreground">{t('walkIns.intro')}</p>
      </header>

      {walkIns.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">{t('walkIns.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {walkIns.map((walkIn) => {
            const isBusy = busyId === walkIn.id;
            return (
              <li
                key={walkIn.id}
                className="flex flex-col gap-3 rounded-xl border p-4"
                data-testid={`walk-in-${walkIn.id}`}
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-start font-medium">
                    {walkIn.firstName} {walkIn.lastName}
                  </p>
                  <p className="text-start text-sm text-muted-foreground">
                    {t('walkIns.signedBy', {
                      name: walkIn.collectedByName,
                      date: new Date(walkIn.signedAt).toLocaleString(i18n.resolvedLanguage),
                    })}
                  </p>
                </div>

                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    const email = field(event, 'email');
                    if (email !== '') void run(walkIn.id, () => onConfirm(walkIn.id, email));
                  }}
                >
                  <label className="flex min-w-64 flex-col gap-1.5 text-sm font-medium">
                    <span>{t('walkIns.emailLabel')}</span>
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="off"
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    />
                  </label>
                  <Button type="submit" disabled={isBusy}>
                    {t('walkIns.confirm')}
                  </Button>
                </form>

                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    const profileId = field(event, 'profileId');
                    if (profileId !== '') void run(walkIn.id, () => onMerge(walkIn.id, profileId));
                  }}
                >
                  <label className="flex min-w-64 flex-col gap-1.5 text-sm font-medium">
                    <span>{t('walkIns.mergeLabel')}</span>
                    <select
                      name="profileId"
                      required
                      defaultValue=""
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="" disabled>
                        {t('walkIns.mergePlaceholder')}
                      </option>
                      {mergeCandidates(walkIn, players).map((player) => (
                        <option key={player.profileId} value={player.profileId}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="submit" variant="outline" disabled={isBusy}>
                    {t('walkIns.merge')}
                  </Button>
                </form>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => {
                      if (window.confirm(t('walkIns.discardConfirm'))) {
                        void run(walkIn.id, () => onDiscard(walkIn.id));
                      }
                    }}
                  >
                    {t('walkIns.discard')}
                  </Button>
                  {outcome?.id === walkIn.id ? (
                    <p aria-live="polite" className="text-start text-sm text-destructive">
                      {t(outcome.messageKey)}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
