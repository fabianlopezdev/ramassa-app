import { Alert, Platform, type AlertButton } from 'react-native';

/** The app's shared native confirmation, with its existing browser fallback. */
export function confirmAction({
  title,
  message,
  cancelLabel,
  confirmLabel,
  onConfirm,
  confirmStyle = 'default',
}: {
  readonly title: string;
  readonly message?: string;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly confirmStyle?: AlertButton['style'];
}): void {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }
  Alert.alert(
    title,
    message,
    [
      { text: cancelLabel, style: 'cancel' },
      { text: confirmLabel, style: confirmStyle, onPress: onConfirm },
    ],
    { cancelable: true },
  );
}
