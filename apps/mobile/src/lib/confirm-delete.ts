import { confirmAction } from './confirm-action';

/** The shared confirmation with the existing delete labels and destructive action. */
export function confirmDelete(
  message: string,
  onConfirm: () => void,
  labels: readonly [cancel: string, confirm: string],
): void {
  confirmAction({
    title: message,
    cancelLabel: labels[0],
    confirmLabel: labels[1],
    confirmStyle: 'destructive',
    onConfirm,
  });
}
