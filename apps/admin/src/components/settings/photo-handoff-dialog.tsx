/**
 * "Take photo with phone" for internal documents (RAPP-254). Opens a
 * single-use handoff bound to this person, shows it as a QR code for the
 * phone's camera, and waits: Realtime says when the phone completed it, with
 * a slow poll in case the socket drops. The database registers the document
 * itself, so closing this dialog early loses nothing.
 */
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createPhotoHandoff,
  fetchPhotoHandoff,
  photoHandoffPath,
  photoHandoffState,
  subscribeToPhotoHandoff,
} from '@ramassa/shared/photo-handoff';

const POLL_MS = 4_000;

type Phase =
  | { readonly kind: 'name' }
  | {
      readonly kind: 'waiting';
      readonly id: string;
      readonly expiresAt: string;
      readonly qr: string;
    }
  | { readonly kind: 'done' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'failed' };

export function PhotoHandoffButton({ onDone }: { readonly onDone: () => void | Promise<void> }) {
  const { t, i18n } = useTranslation('settings');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'name' });
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const handoff = await createPhotoHandoff(supabase, {
        target: 'internal_document',
        documentName: name,
      });
      const url = `${window.location.origin}${photoHandoffPath(handoff.id)}`;
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 280 });
      setPhase({ kind: 'waiting', id: handoff.id, expiresAt: handoff.expiresAt, qr });
    } catch {
      setPhase({ kind: 'failed' });
    } finally {
      setBusy(false);
    }
  };

  // While waiting: Realtime, a slow poll, and the expiry.
  useEffect(() => {
    if (phase.kind !== 'waiting') return;
    let finished = false;
    const finish = (next: Phase) => {
      if (finished) return;
      finished = true;
      setPhase(next);
      if (next.kind === 'done') void onDone();
    };
    const check = async () => {
      const handoff = await fetchPhotoHandoff(supabase, phase.id).catch(() => null);
      if (handoff === null) return;
      const state = photoHandoffState(handoff);
      if (state === 'done') finish({ kind: 'done' });
      if (state === 'expired') finish({ kind: 'expired' });
    };
    const unsubscribe = subscribeToPhotoHandoff(supabase, phase.id, () => finish({ kind: 'done' }));
    const poll = window.setInterval(() => void check(), POLL_MS);
    const expiry = window.setTimeout(
      () => void check(),
      Math.max(0, Date.parse(phase.expiresAt) - Date.now() + 500),
    );
    return () => {
      finished = true;
      unsubscribe();
      window.clearInterval(poll);
      window.clearTimeout(expiry);
    };
  }, [onDone, phase]);

  const openDialog = () => {
    const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date());
    setName(t('handoff.defaultName', { date }));
    setPhase({ kind: 'name' });
    setOpen(true);
  };
  const time = (iso: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeStyle: 'short' }).format(new Date(iso));

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={openDialog}
        data-testid="photo-handoff-open"
      >
        {t('handoff.button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="photo-handoff-dialog">
          <DialogTitle>{t('handoff.title')}</DialogTitle>
          {phase.kind === 'name' || phase.kind === 'failed' ? (
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm font-medium">
                {t('handoff.nameLabel')}
                <Input
                  data-testid="photo-handoff-name"
                  value={name}
                  maxLength={255}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {phase.kind === 'failed' ? (
                <p role="alert" className="text-sm text-destructive">
                  {t('handoff.failed')}
                </p>
              ) : null}
              <Button
                type="button"
                className="w-fit"
                disabled={busy || name.trim().length === 0}
                onClick={() => void start()}
                data-testid="photo-handoff-start"
              >
                {busy ? t('working') : t('handoff.start')}
              </Button>
            </div>
          ) : null}
          {phase.kind === 'waiting' ? (
            <div className="grid justify-items-center gap-3 text-center">
              <DialogDescription>{t('handoff.scan')}</DialogDescription>
              <img
                src={phase.qr}
                alt={t('handoff.qrLabel')}
                width={280}
                height={280}
                data-testid="photo-handoff-qr"
                data-handoff-id={phase.id}
              />
              <p className="text-sm text-muted-foreground">
                {t('handoff.expiresAt', { time: time(phase.expiresAt) })}
              </p>
              <p role="status" className="text-sm font-medium">
                {t('handoff.waiting')}
              </p>
            </div>
          ) : null}
          {phase.kind === 'done' || phase.kind === 'expired' ? (
            <div className="grid gap-3">
              <p role="status" className="text-sm font-medium" data-testid="photo-handoff-result">
                {phase.kind === 'done' ? t('handoff.done') : t('handoff.expired')}
              </p>
              <div className="flex gap-2">
                {phase.kind === 'expired' ? (
                  <Button type="button" onClick={() => setPhase({ kind: 'name' })}>
                    {t('handoff.again')}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t('handoff.close')}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
