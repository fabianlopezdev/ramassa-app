/**
 * Deleting a test player (RAPP-617). A test player is made up to try the
 * onboarding, so the person designing it deletes her and creates her again
 * with the same address. The button exists only on a test player; the
 * database refuses the deletion for a real one whatever the screen does.
 *
 * A plain confirmation, without the typed phrase of the RGPD erasure: the
 * deletion is repeated many times a day and touches no real person.
 */

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function TestPlayerDelete({
  name,
  onDelete,
}: {
  readonly name: string;
  /** The whole act: her files, then her record. Throws when refused. */
  readonly onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation('participants');
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setWorking(true);
    setFailed(false);
    try {
      await onDelete();
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4" data-testid="test-player-delete">
      <p className="text-start text-sm text-muted-foreground">{t('testPlayerDeleteHint')}</p>
      <Button
        type="button"
        size="lg"
        variant="destructive"
        className="w-fit"
        onClick={() => {
          setFailed(false);
          setOpen(true);
        }}
      >
        {t('testPlayerDeleteAction')}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (working ? undefined : setOpen(next))}>
        <DialogContent>
          <DialogTitle className="text-start text-lg font-semibold">
            {t('testPlayerDeleteTitle', { name })}
          </DialogTitle>
          <DialogDescription className="text-start text-sm text-muted-foreground">
            {t('testPlayerDeleteBody')}
          </DialogDescription>
          {failed ? (
            <p role="alert" className="text-start text-sm text-destructive">
              {t('testPlayerDeleteFailed')}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={working}
              onClick={() => setOpen(false)}
            >
              {t('testPlayerDeleteCancel')}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="destructive"
              disabled={working}
              onClick={() => void confirm()}
            >
              {t('testPlayerDeleteConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
