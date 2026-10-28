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
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  action,
  onConfirm,
  children,
  isBusy,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly action: string;
  readonly onConfirm: () => void;
  readonly children?: ReactNode;
  readonly isBusy?: boolean;
}) {
  const { t } = useTranslation('settings');
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>{t('onboardingBoard.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isBusy}
            onClick={(event) => {
              if (isBusy !== undefined) event.preventDefault();
              onConfirm();
            }}
            data-testid="confirm-delete"
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
