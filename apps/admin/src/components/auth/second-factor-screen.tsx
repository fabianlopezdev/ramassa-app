/**
 * The second factor (RAPP-233). A team member or entity contact verifies her
 * session with an authenticator app before her area opens; until then the
 * database lets the session reach nothing. Without an authenticator yet, she
 * sets one up here: a QR code, and the same secret as text for typing by hand
 * or for a screen reader.
 */
import { AuthFormError } from '@/components/auth/auth-form-error';
import { AuthLoading } from '@/components/auth/auth-loading';
import { ControlCenterHeader } from '@/components/auth/control-center-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logout } from '@/lib/auth';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { safeAsync } from '@/lib/observability';
import { publicOrganizationLogoUrl } from '@/lib/organization-slug';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  startSecondFactor,
  verifySecondFactor,
  type SecondFactorStart,
} from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';

export function SecondFactorScreen() {
  const { t } = useTranslation('auth');
  const [start, setStart] = useState<SecondFactorStart | null>(null);
  const [code, setCode] = useState('');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let isCurrent = true;
    void safeAsync(() => startSecondFactor(supabase)).then((result) => {
      if (!isCurrent) return;
      if (result.ok) setStart(result.value);
      else setErrorCode(result.error.code);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (start === null) return;
    setErrorCode(null);
    setIsVerifying(true);
    const result = await safeAsync(() => verifySecondFactor(supabase, start.factorId, code));
    setIsVerifying(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    // The session is aal2 now and the guard opens the area. The page's data was
    // loaded before, when the database still refused it, so it is loaded again.
    await router.invalidate();
  }

  if (start === null && errorCode === null) return <AuthLoading label={t('signingIn')} />;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-svh flex-col items-center justify-center p-6"
      data-testid="second-factor"
    >
      <div className="flex w-full max-w-sm flex-col gap-5">
        <ControlCenterHeader
          title={start?.kind === 'enroll' ? t('secondFactorEnrollTitle') : t('secondFactorTitle')}
          logoUrl={publicOrganizationLogoUrl(mediaWorkerUrl)}
        >
          <p className="text-muted-foreground text-sm">
            {start?.kind === 'enroll' ? t('secondFactorEnrollIntro') : t('secondFactorIntro')}
          </p>
        </ControlCenterHeader>

        {start?.kind === 'enroll' ? (
          <div className="flex flex-col items-start gap-3">
            <img
              src={start.qrCode}
              alt={t('secondFactorQrAlt')}
              className="size-44 rounded-md border bg-white p-2"
            />
            <p className="text-sm">{t('secondFactorSecretLabel')}</p>
            <code
              className="break-all rounded-md bg-muted px-3 py-2 font-mono text-sm"
              data-testid="second-factor-secret"
            >
              {start.secret}
            </code>
          </div>
        ) : null}

        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <AuthFormError code={errorCode} />
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="second-factor-code">
            {t('secondFactorCodeLabel')}
          </label>
          <Input
            id="second-factor-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            disabled={start === null}
          />
          <Button
            type="submit"
            className="h-11 w-full text-base"
            disabled={start === null || isVerifying || code.length !== 6}
          >
            {t('secondFactorVerifyAction')}
          </Button>
        </form>
        <Button variant="ghost" className="self-start" onClick={() => void logout()}>
          {t('signOutAction')}
        </Button>
      </div>
    </main>
  );
}
