/**
 * Her consents (RAPP-699): each consent of Dades legals with her current
 * state, the latest decision, and a short history of every decision: when,
 * how (app, tablet, paper, her profile, the team), on which form and version,
 * who recorded it and why a staff withdrawal was made. The words she was
 * shown stay with the current decision, in the language she read them.
 *
 * Staff with consents.collect record a decision here: one given or withdrawn
 * on paper, with its date, or a withdrawal she asked for, with its reason.
 * Withdrawing the health data consent deletes her health answer, as her own
 * withdrawal does. Only staff with participants.view_personal see the
 * section, as the database reads it.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParticipantConsent, StaffConsentMethod } from '@ramassa/shared/authorization';
import { textIn, type Consent } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

const HEALTH_DATA_KEY = 'health_data';

export interface ConsentRecording {
  readonly consentId: string;
  readonly granted: boolean;
  readonly method: StaffConsentMethod;
  readonly reason: string | null;
  readonly decidedOn: string | null;
}

interface ConsentRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  /** Her decisions, the newest first; the first is her current state. */
  readonly history: readonly ParticipantConsent[];
}

/** The catalogue's consents in its order, then any consent she decided that left it. */
export function consentRows(
  history: readonly ParticipantConsent[],
  catalogue: readonly Consent[],
  language: LanguageCode,
): readonly ConsentRow[] {
  const decided = new Map<string, ParticipantConsent[]>();
  for (const decision of history) {
    const id = decision.consentId ?? decision.key;
    decided.set(id, [...(decided.get(id) ?? []), decision]);
  }
  const fromCatalogue = catalogue
    .filter((consent) => !consent.isArchived || decided.has(consent.id))
    .map((consent) => ({
      id: consent.id,
      key: consent.key,
      name: textIn(consent.name, language) || consent.key,
      history: decided.get(consent.id) ?? [],
    }));
  const listed = new Set(fromCatalogue.map((row) => row.id));
  const elsewhere = [...decided.entries()]
    .filter(([id]) => !listed.has(id))
    .map(([id, decisions]) => {
      const latest = decisions[0]!;
      return {
        id,
        key: latest.key,
        name: textIn(latest.name ?? {}, language) || latest.wording || latest.key,
        history: decisions,
      };
    });
  return [...fromCatalogue, ...elsewhere];
}

type Recording = { readonly row: ConsentRow; readonly kind: 'paper' | 'withdraw' };

export function ParticipantConsents({
  history,
  catalogue,
  canRecord,
  onRecord,
}: {
  readonly history: readonly ParticipantConsent[];
  readonly catalogue: readonly Consent[];
  /** consents.collect. */
  readonly canRecord: boolean;
  readonly onRecord: (recording: ConsentRecording) => Promise<void>;
}) {
  const { t, i18n } = useTranslation('participants');
  const locale = i18n.resolvedLanguage ?? 'ca';
  const rows = consentRows(history, catalogue, locale as LanguageCode);
  const [recording, setRecording] = useState<Recording | null>(null);
  const date = (value: string) => new Date(value).toLocaleDateString(locale);

  const source = (decision: ParticipantConsent) => {
    if (decision.versionNumber !== null) {
      return t('consents.version', {
        season: decision.seasonName ?? '',
        number: decision.versionNumber,
      });
    }
    return decision.form === 'onboarding' ? t('consents.onboarding') : null;
  };

  return (
    <section
      aria-labelledby="participant-consents-title"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="participant-consents-section"
    >
      <h2 id="participant-consents-title" className="text-start text-lg font-semibold">
        {t('consents.title')}
      </h2>
      {rows.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">{t('consents.none')}</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="participant-consents">
          {rows.map((row) => {
            const current = row.history[0];
            return (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-lg border p-3"
                data-testid={`participant-consent-${row.key}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-start text-sm font-medium">{row.name}</p>
                  <Badge variant={current?.granted ? 'secondary' : 'outline'}>
                    {current === undefined
                      ? t('consents.undecided')
                      : current.granted
                        ? t('consents.granted')
                        : t('consents.notGranted')}
                  </Badge>
                </div>
                {current?.wording ? (
                  // The words she was shown (RAPP-614), in the language she read them.
                  <p
                    className="text-start text-xs text-muted-foreground"
                    lang={current.language ?? undefined}
                    dir="auto"
                  >
                    {current.wording}
                  </p>
                ) : null}
                {row.history.length === 0 ? null : (
                  <ol className="flex flex-col gap-1 text-start text-xs">
                    {row.history.map((decision, index) => (
                      <li key={`${decision.decidedAt}-${index}`} className="flex flex-col">
                        <span>
                          {[
                            date(decision.decidedAt),
                            decision.granted ? t('consents.granted') : t('consents.notGranted'),
                            t(`consents.method.${decision.method}`, {
                              defaultValue: decision.method,
                            }),
                            source(decision),
                            decision.recordedByName,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {decision.reason === null ? null : (
                          <span className="text-muted-foreground">{decision.reason}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {canRecord ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setRecording({ row, kind: 'paper' })}
                      data-testid={`participant-consent-paper-${row.key}`}
                    >
                      {t('consents.recordPaper')}
                    </Button>
                    {current?.granted ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setRecording({ row, kind: 'withdraw' })}
                        data-testid={`participant-consent-withdraw-${row.key}`}
                      >
                        {t('consents.withdraw')}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {recording === null ? null : (
        <RecordConsentDialog
          recording={recording}
          onClose={() => setRecording(null)}
          onRecord={onRecord}
        />
      )}
    </section>
  );
}

function RecordConsentDialog({
  recording,
  onClose,
  onRecord,
}: {
  readonly recording: Recording;
  readonly onClose: () => void;
  readonly onRecord: (recording: ConsentRecording) => Promise<void>;
}) {
  const { t } = useTranslation('participants');
  const [granted, setGranted] = useState(true);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const isWithdrawal = recording.kind === 'withdraw';
  const withdraws = isWithdrawal || !granted;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get('consent-reason') ?? '').trim();
    const decidedOn = String(form.get('consent-decided-on') ?? '');
    setWorking(true);
    setFailed(false);
    try {
      await onRecord({
        consentId: recording.row.id,
        granted: isWithdrawal ? false : granted,
        method: isWithdrawal ? 'staff' : 'paper',
        reason: reason === '' ? null : reason,
        decidedOn: isWithdrawal || decidedOn === '' ? null : decidedOn,
      });
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (working || next ? undefined : onClose())}>
      <DialogContent>
        <DialogTitle className="text-start text-lg font-semibold">
          {isWithdrawal ? t('consents.withdraw') : t('consents.recordPaper')}
        </DialogTitle>
        <DialogDescription className="text-start text-sm">{recording.row.name}</DialogDescription>
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          {isWithdrawal ? null : (
            <>
              <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="sr-only">{t('consents.decision')}</legend>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="consent-granted"
                    checked={granted}
                    onChange={() => setGranted(true)}
                  />
                  {t('consents.granted')}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="consent-granted"
                    checked={!granted}
                    onChange={() => setGranted(false)}
                    data-testid="consent-record-not-granted"
                  />
                  {t('consents.notGranted')}
                </label>
              </fieldset>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                <span>{t('consents.paperDate')}</span>
                <input
                  name="consent-decided-on"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  className="h-9 w-fit rounded-md border border-input bg-transparent px-3 text-sm"
                />
              </label>
            </>
          )}
          {withdraws ? (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>{t('consents.reason')}</span>
              <Textarea name="consent-reason" rows={3} maxLength={1000} required />
            </label>
          ) : null}
          {withdraws && recording.row.key === HEALTH_DATA_KEY ? (
            <p className="text-start text-sm text-destructive" data-testid="consent-health-warning">
              {t('consents.healthWarning')}
            </p>
          ) : null}
          {failed ? (
            <p role="alert" className="text-start text-sm text-destructive">
              {t('consents.failed')}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" disabled={working} onClick={onClose}>
              {t('consents.cancel')}
            </Button>
            <Button type="submit" disabled={working} data-testid="consent-record-save">
              {t('consents.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
