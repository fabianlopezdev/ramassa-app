import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { PasswordLoginForm } from '@/components/auth/password-login-form';
import { Button } from '@/components/ui/button';
import { roleLandingPath } from '@/lib/auth';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

type LoginMode = 'magic' | 'password';

function LoginPage() {
  const { t } = useTranslation(['admin', 'auth', 'common']);
  const { session, role } = useAuth();
  const [mode, setMode] = useState<LoginMode>('magic');
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);

  // Already signed in (a resolved role): send them to their landing.
  if (session && role) {
    return <Navigate to={roleLandingPath(role)} />;
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1 text-start">
          <h1 className="text-2xl font-bold text-foreground">{t('admin:loginTitle')}</h1>
          {mode === 'magic' && !sentToEmail ? (
            <p className="text-muted-foreground text-sm">{t('auth:loginSubtitle')}</p>
          ) : null}
        </div>

        {sentToEmail ? (
          <div className="flex flex-col gap-4 text-start" aria-live="polite">
            <h2 className="text-lg font-semibold text-foreground">
              {t('auth:magicLinkSentTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('auth:magicLinkSentBody', { email: sentToEmail })}
            </p>
            <Button variant="ghost" className="self-start" onClick={() => setSentToEmail(null)}>
              {t('common:back')}
            </Button>
          </div>
        ) : mode === 'magic' ? (
          <div className="flex flex-col gap-4">
            <MagicLinkForm onSent={setSentToEmail} />
            <p className="text-muted-foreground text-start text-sm">{t('auth:magicLinkHint')}</p>
            <Button variant="link" className="self-center" onClick={() => setMode('password')}>
              {t('auth:usePasswordInstead')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <PasswordLoginForm />
            <Button variant="link" className="self-center" onClick={() => setMode('magic')}>
              {t('auth:useMagicLinkInstead')}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
