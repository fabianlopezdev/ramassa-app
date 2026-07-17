import { i18n } from '@/lib/i18n';
import { Stack } from 'expo-router/stack';
import { I18nextProvider } from 'react-i18next';
import '../global.css';

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </I18nextProvider>
  );
}
