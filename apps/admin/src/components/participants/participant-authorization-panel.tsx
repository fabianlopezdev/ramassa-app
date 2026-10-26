/**
 * Her participation authorizations, as staff see them (RAPP-304).
 *
 * Each season she signed: how (in the app, on a staff device, on paper), which
 * version, when, and whether she signed with a drawing or with the ticks alone.
 * The drawn signature shows only with participants.view_sensitive. Her health
 * and her emergency contact are answers since RAPP-698: they show with her
 * other answers, each by its field's level. Staff record a paper signature
 * for the current season here, so a player who signed in September is not
 * asked again.
 */

import { Button } from '@/components/ui/button';
import type { SeasonAnswersLine } from '@/lib/participant-fitxa';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParticipantAuthorization, ParticipantConsent } from '@ramassa/shared/authorization';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import type { ParticipantRecord } from '@ramassa/shared/participants';

/** The strokes are 0..1000 on both axes, so they fill any box the same way. */
export function SignatureDrawing({
  strokes,
  label,
}: {
  readonly strokes: SignatureStrokes;
  readonly label: string;
}) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="h-24 w-72 rounded border bg-white"
    >
      {strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={stroke.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export interface ParticipantAuthorizationPanelProps {
  readonly participant: ParticipantRecord;
  readonly authorizations: readonly ParticipantAuthorization[];
  readonly consents: readonly ParticipantConsent[];
  readonly onRecordPaper: (signedOn: string) => Promise<void>;
  /** Her answers by season (RAPP-306), in words, read by field (RAPP-664). */
  readonly seasonAnswers?: readonly SeasonAnswersLine[];
  readonly onSetPriorSeasons?: (count: number) => Promise<void>;
}

export function ParticipantAuthorizationPanel({
  participant,
  authorizations,
  consents,
  onRecordPaper,
  seasonAnswers = [],
  onSetPriorSeasons,
}: ParticipantAuthorizationPanelProps) {
  const { t, i18n } = useTranslation(['participants', 'settings', 'profile', 'onboarding']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [priorStatus, setPriorStatus] = useState<'idle' | 'saved' | 'failed'>('idle');

  async function savePrior(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const count = Number(new FormData(event.currentTarget).get('prior-seasons') ?? '');
    if (onSetPriorSeasons === undefined || !Number.isInteger(count)) return;
    try {
      await onSetPriorSeasons(count);
      setPriorStatus('saved');
    } catch {
      setPriorStatus('failed');
    }
  }
  const date = (value: string) => new Date(value).toLocaleDateString(locale);
  // A record from before the wording was kept (or a change outside the
  // authorization) names the consent by its built-in name, or its key.
  const consentName = (consent: ParticipantConsent) =>
    consent.wording ??
    t(`settings:authorizationConsent.${consent.key}`, { defaultValue: consent.key });
  const notProvided = t('profile:notProvided');

  async function recordPaper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signedOn = String(new FormData(event.currentTarget).get('paper-signed-on') ?? '');
    if (signedOn === '') return;
    setStatus('saving');
    try {
      await onRecordPaper(signedOn);
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <section
      aria-labelledby="authorization-panel-title"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="participant-authorization"
    >
      <h2 id="authorization-panel-title" className="text-start text-lg font-semibold">
        {t('participants:authorizationTitle')}
      </h2>

      {authorizations.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">
          {t('participants:authorizationNone')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {authorizations.map((authorization) => (
            <li key={authorization.id} className="flex flex-col gap-1 rounded-lg border p-3">
              <p className="text-start text-sm font-medium">
                {authorization.method === 'paper'
                  ? t('participants:authorizationPaperRow', {
                      season: authorization.seasonName,
                      date: authorization.paperSignedOn ?? '',
                    })
                  : t('participants:authorizationSignedRow', {
                      season: authorization.seasonName,
                      number: authorization.versionNumber ?? '',
                      date: date(authorization.signedAt),
                      method: t(`participants:authorizationMethod.${authorization.method}`),
                    })}
              </p>
              {authorization.unableToDraw ? (
                <p className="text-start text-xs text-muted-foreground">
                  {t('participants:authorizationUnableToDraw')}
                </p>
              ) : null}
              {authorization.signature === null ? null : (
                <SignatureDrawing
                  strokes={authorization.signature}
                  label={t('participants:authorizationSignatureLabel')}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {consents.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <h3 className="text-start text-sm font-semibold">
            {t('participants:authorizationConsentsTitle')}
          </h3>
          <ul className="flex flex-col gap-1" data-testid="participant-consents">
            {consents.map((consent) => (
              <li key={consent.key} className="flex flex-col text-start text-sm">
                {/* The words she was shown (RAPP-614), in the language she read them. */}
                <span lang={consent.language ?? undefined} dir="auto">
                  {consentName(consent)}
                </span>
                <span>
                  {consent.granted
                    ? t('participants:authorizationGranted')
                    : t('participants:authorizationNotGranted')}{' '}
                  <span className="text-xs text-muted-foreground">
                    (
                    {consent.versionNumber === null
                      ? date(consent.decidedAt)
                      : t('participants:authorizationConsentVersion', {
                          date: date(consent.decidedAt),
                          season: consent.seasonName ?? '',
                          number: consent.versionNumber,
                        })}
                    {consent.required === true ? ` · ${t('settings:authorizationRequired')}` : ''})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The season number is counted: earlier seasons plus the seasons she
          signed (RAPP-306). Staff enter the seasons before the app. */}
      <div className="flex flex-col gap-2">
        <p className="text-start text-sm font-medium" data-testid="participant-season-number">
          {participant.season_number == null
            ? notProvided
            : t('participants:seasonNumberValue', { number: participant.season_number })}
        </p>
        {onSetPriorSeasons === undefined ? null : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => void savePrior(event)}
          >
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>{t('participants:priorSeasonsLabel')}</span>
              <input
                id="prior-seasons"
                name="prior-seasons"
                type="number"
                min={0}
                max={20}
                required
                className="h-9 w-24 rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </label>
            <Button type="submit" variant="outline">
              {t('participants:priorSeasonsSave')}
            </Button>
            {priorStatus === 'saved' ? (
              <p aria-live="polite" className="text-start text-sm text-muted-foreground">
                {t('participants:priorSeasonsSaved')}
              </p>
            ) : null}
            {priorStatus === 'failed' ? (
              <p role="alert" className="text-start text-sm text-destructive">
                {t('participants:priorSeasonsFailed')}
              </p>
            ) : null}
          </form>
        )}
      </div>

      {seasonAnswers.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <h3 className="text-start text-sm font-semibold">
            {t('participants:seasonAnswersTitle')}
          </h3>
          <ul className="flex flex-col gap-1" data-testid="participant-season-answers">
            {seasonAnswers.map((answers) => (
              <li key={answers.seasonName} className="text-start text-sm">
                <span className="font-medium">{answers.seasonName}</span>
                {': '}
                {answers.text === '' ? notProvided : answers.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => void recordPaper(event)}
        data-testid="paper-authorization-form"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>{t('participants:authorizationPaperDate')}</span>
          <input
            id="paper-signed-on"
            name="paper-signed-on"
            type="date"
            required
            max={new Date().toISOString().slice(0, 10)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <Button type="submit" variant="outline" disabled={status === 'saving'}>
          {t('participants:authorizationPaperAction')}
        </Button>
        {status === 'saved' ? (
          <p aria-live="polite" className="text-start text-sm text-muted-foreground">
            {t('participants:authorizationPaperSaved')}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t('participants:authorizationPaperFailed')}
          </p>
        ) : null}
      </form>
    </section>
  );
}
