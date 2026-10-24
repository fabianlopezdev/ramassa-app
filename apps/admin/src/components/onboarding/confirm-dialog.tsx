/**
 * A yes-or-no before a change that removes something (RAPP-641, RAPP-651):
 * deleting a screen, taking a field off a screen. The action reads as
 * destructive; Cancel keeps everything.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';

export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  action,
  onConfirm,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly action: string;
  readonly onConfirm: () => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('onboardingBoard.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} data-testid="confirm-delete">
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
