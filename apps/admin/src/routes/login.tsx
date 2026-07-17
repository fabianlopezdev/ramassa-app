import { Button } from '@/components/ui/button';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation(['admin', 'auth']);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-lg font-semibold text-neutral-900">{t('admin:loginTitle')}</h1>
      <Button>{t('auth:loginAction')}</Button>
    </main>
  );
}
