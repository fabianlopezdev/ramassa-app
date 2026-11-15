/**
 * The Desa dialog (RAPP-696), the same on every form: saving a change to a
 * form players have already answered asks how it reaches them.
 *
 *   - Correcció: the text is fixed and nobody who answered has to do
 *     anything. The old version stays recorded.
 *   - Nova versió: everybody answers again.
 *
 * A form may say under Nova versió how many will answer again. A form nobody
 * has answered saves at once, with no dialog. Onboarding never asks: it is
 * only for players who have not joined yet (RAPP-705).
 */

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SaveKind } from '@ramassa/shared/authorization';

type Save = (kind: SaveKind) => Promise<void>;

/**
 * Asks Correcció or Nova versió before a save, only once anyone has answered.
 * `request` runs the save, now or after the choice; `dialog` is rendered once
 * by the form.
 */
export function useSaveKind({
  hasAnswers,
  newVersionNote = null,
}: {
  /** Players (or entities) already answered this form. */
  readonly hasAnswers: boolean;
  /** A line under Nova versió, such as how many will answer again; null for none. */
  readonly newVersionNote?: string | null;
}): { readonly request: (save: Save) => Promise<void>; readonly dialog: ReactNode } {
  const [pending, setPending] = useState<{ readonly save: Save } | null>(null);
  async function request(save: Save) {
    if (!hasAnswers) {
      await save('new');
      return;
    }
    setPending({ save });
  }
  return {
    request,
    dialog: (
      <SaveKindDialog
        isOpen={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        newVersionNote={newVersionNote}
        onSave={async (kind) => {
          const save = pending?.save;
          setPending(null);
          await save?.(kind);
        }}
      />
    ),
  };
}

function SaveKindDialog({
  isOpen,
  onOpenChange,
  newVersionNote,
  onSave,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly newVersionNote: string | null;
  readonly onSave: (kind: SaveKind) => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const [kind, setKind] = useState<SaveKind>('correction');
  const choices = [
    { kind: 'correction', title: t('saveDialog.correction'), body: t('saveDialog.correctionBody') },
    {
      kind: 'new',
      title: t('saveDialog.newVersion'),
      body: t('saveDialog.newVersionBody'),
      note: newVersionNote,
    },
  ] as const satisfies readonly {
    kind: SaveKind;
    title: string;
    body: string;
    note?: string | null;
  }[];
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setKind('correction');
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-md" data-testid="save-kind-dialog">
        <DialogTitle>{t('saveDialog.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('saveDialog.title')}</DialogDescription>
        <div role="radiogroup" aria-label={t('saveDialog.title')} className="flex flex-col gap-3">
          {choices.map((choice) => {
            const note = 'note' in choice ? choice.note : null;
            const isChosen = kind === choice.kind;
            return (
              <button
                key={choice.kind}
                type="button"
                role="radio"
                aria-checked={isChosen}
                onClick={() => setKind(choice.kind)}
                data-testid={`save-kind-${choice.kind}`}
                className={cn(
                  'flex flex-col gap-1 rounded-xl border p-4 text-start transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  isChosen ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                )}
              >
                <span className="text-sm font-semibold">{choice.title}</span>
                <span className="text-sm text-muted-foreground">{choice.body}</span>
                {note === null ? null : (
                  <span className="text-xs font-medium text-muted-foreground">{note}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('onboardingBoard.cancel')}
          </Button>
          <Button type="button" onClick={() => void onSave(kind)} data-testid="save-kind-confirm">
            {t('saveDialog.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
