/**
 * Asks before a delete (RAPP-414, from forum moderation): a native alert with
 * Cancel and a destructive confirm, or the browser's confirm on the web build,
 * which has no native alert.
 */
import { Alert, Platform } from 'react-native';

export function confirmDelete(
  message: string,
  onConfirm: () => void,
  labels: readonly [cancel: string, confirm: string],
): void {
  if (Platform.OS === 'web') {
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert(message, undefined, [
    { text: labels[0], style: 'cancel' },
    { text: labels[1], style: 'destructive', onPress: onConfirm },
  ]);
}
