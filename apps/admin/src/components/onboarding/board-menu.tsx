/**
 * The board's More menu (RAPP-641): download the whole onboarding setup,
 * import one (admins only, RAPP-621), and put the screens back in the app's
 * own order.
 */

import { APP_COMMIT, saveFile, useReload } from '@/components/settings/onboarding-design-sections';
import { SetupImport } from '@/components/settings/setup-transfer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';
import { Download, Ellipsis, RotateCcw, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  exportOnboardingSetup,
  importOnboardingSetup,
  onboardingSetupFileName,
  previewOnboardingSetupImport,
} from '@ramassa/shared/intake';
import { saveWizardFlowOrder } from '@ramassa/shared/intake-builder';

export function BoardMenu({ canImport }: { readonly canImport: boolean }) {
  const { t } = useTranslation('settings');
  const reload = useReload();
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  async function download() {
    try {
      const document = await exportOnboardingSetup(supabase, APP_COMMIT);
      saveFile(onboardingSetupFileName(new Date()), `${JSON.stringify(document, null, 2)}\n`);
      toast.success(t('setupTransfer.downloaded'));
    } catch {
      toast.error(t('setupTransfer.downloadFailed'));
    }
  }

  async function reset() {
    try {
      // An empty order is the app's own (RAPP-612).
      await saveWizardFlowOrder(supabase, []);
      await reload();
      toast.success(t('builtinScreens.orderSaved'));
    } catch {
      toast.error(t('onboardingBoard.orderFailed'));
    }
  }

  return (
    <>
      {/* Not modal, so the dialogs it opens take the focus cleanly. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" data-testid="board-more">
            <Ellipsis aria-hidden data-icon="inline-start" />
            {t('onboardingBoard.more')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => void download()} data-testid="board-export">
            <Download aria-hidden />
            {t('onboardingBoard.export')}
          </DropdownMenuItem>
          {canImport ? (
            <DropdownMenuItem onSelect={() => setIsImporting(true)} data-testid="board-import">
              <Upload aria-hidden />
              {t('onboardingBoard.import')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIsResetting(true)} data-testid="board-reset">
            <RotateCcw aria-hidden />
            {t('builtinScreens.resetOrder')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isImporting} onOpenChange={setIsImporting}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{t('setupTransfer.importTitle')}</DialogTitle>
          <DialogDescription>{t('setupTransfer.importIntro')}</DialogDescription>
          <SetupImport
            appCommit={APP_COMMIT}
            onPreview={(raw) => previewOnboardingSetupImport(supabase, raw)}
            onImport={async (raw) => {
              const report = await importOnboardingSetup(supabase, raw);
              await reload();
              return report;
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={isResetting} onOpenChange={setIsResetting}>
        <AlertDialogContent aria-describedby={undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('onboardingBoard.resetTitle')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('onboardingBoard.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void reset()} data-testid="board-reset-confirm">
              {t('onboardingBoard.reset')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
