/**
 * The Desa dialog (RAPP-696), the same on every form: saving a change to a
 * form players have already answered asks how it reaches them.
 *
 *   - Correcció: the text is fixed and nobody who answered has to do
 *     anything. The old version stays recorded.
 *   - Nova versió: everybody answers again.
 *
 * A form where a new version cannot reach them yet passes the reason, and the
 * choice shows disabled with it. A form nobody has answered saves at once,
 * with no dialog.
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
  newVersionBlockedReason = null,
}: {
  /** Players (or entities) already answered this form. */
  readonly hasAnswers: boolean;
  /** Why a new version cannot be chosen here yet; null when it can. */
  readonly newVersionBlockedReason?: string | null;
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
        newVersionBlockedReason={newVersionBlockedReason}
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
  newVersionBlockedReason,
  onSave,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly newVersionBlockedReason: string | null;
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
      blocked: newVersionBlockedReason,
    },
  ] as const satisfies readonly {
    kind: SaveKind;
    title: string;
    body: string;
    blocked?: string | null;
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
            const blocked = 'blocked' in choice ? choice.blocked : null;
            const isChosen = kind === choice.kind;
            return (
              <button
                key={choice.kind}
                type="button"
                role="radio"
                aria-checked={isChosen}
                disabled={blocked !== null}
                onClick={() => setKind(choice.kind)}
                data-testid={`save-kind-${choice.kind}`}
                className={cn(
                  'flex flex-col gap-1 rounded-xl border p-4 text-start transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60',
                  isChosen ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                )}
              >
                <span className="text-sm font-semibold">{choice.title}</span>
                <span className="text-sm text-muted-foreground">{choice.body}</span>
                {blocked === null ? null : (
                  <span className="text-xs text-muted-foreground">{blocked}</span>
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
