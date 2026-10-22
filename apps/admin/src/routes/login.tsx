import { ControlCenterHeader } from '@/components/auth/control-center-header';
import {
  EmailOtpExistingCodeForm,
  EmailOtpRequestForm,
  EmailOtpVerifyForm,
} from '@/components/auth/email-otp-form';
import { NoAdminAccess } from '@/components/auth/no-admin-access';
import { PasswordLoginForm } from '@/components/auth/password-login-form';
import { SecondFactorScreen } from '@/components/auth/second-factor-screen';
import { usePublicBrandingReady } from '@/components/branding/organization-branding-provider';
import { LanguageChoiceRow } from '@/components/language-choice-row';
import { Button } from '@/components/ui/button';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { publicOrganizationLogoUrl } from '@/lib/organization-slug';
import { roleLandingPath } from '@/lib/role-landing';
import { isInternalPath } from '@/lib/staff-route-guard';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAuth } from '@ramassa/shared/auth';

/**
 * `?code=1` opens the "I already have a code" step directly. The invitation
 * email links here (RAPP-225), so its code works without sending another email.
 *
 * A team member signed in with her first factor only does her second factor
 * here (RAPP-233). The staff layout sends an unverified session here before
 * any page loader runs, with the page she asked for in `next` (RAPP-615).
 */
export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    code: z.literal(1).optional().catch(undefined),
    next: z.string().max(2000).refine(isInternalPath).optional().catch(undefined),
  }),
  component: LoginPage,
});

type LoginMode = 'otp' | 'existing-code' | 'password';

function LoginPage() {
  const { t } = useTranslation(['admin', 'auth', 'common']);
  const brandingReady = usePublicBrandingReady();
  const { session, role, needsSecondFactor } = useAuth();
  const search = Route.useSearch();
  const [mode, setMode] = useState<LoginMode>(search.code === 1 ? 'existing-code' : 'otp');
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);

  // Already signed in (a resolved role): send them to their landing. A role
  // with no admin home (a player) gets the terminal no-access state instead of
  // a redirect that would bounce straight back here.
  if (session && role) {
    if (needsSecondFactor) return <SecondFactorScreen />;
    const landing = roleLandingPath(role);
    if (landing === null) return <NoAdminAccess />;
    // Back to the page she asked for: a team member only, and only inside the admin.
    const next =
      (role === 'staff' || role === 'admin') && search.next !== undefined ? search.next : null;
    // `href` wins over `to` when both are given (router-core buildLocation).
    return next === null ? (
      <Navigate to={landing} />
    ) : (
      <Navigate to={landing} href={next} replace />
    );
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-svh flex-col items-center justify-center p-6"
    >
      <div
        className={`flex w-full max-w-sm flex-col gap-6 motion-safe:transition-opacity motion-safe:duration-300 ${brandingReady ? 'opacity-100' : 'opacity-0'}`}
        data-branding-ready={brandingReady}
      >
        <ControlCenterHeader
          title={t('admin:loginTitle')}
          logoUrl={publicOrganizationLogoUrl(mediaWorkerUrl)}
        >
          {mode === 'otp' && !sentToEmail ? (
            <p className="text-muted-foreground text-sm">{t('auth:loginSubtitle')}</p>
          ) : null}
          {mode === 'existing-code' && !sentToEmail ? (
            <p className="text-muted-foreground text-sm">{t('auth:emailOtpExistingCodeBody')}</p>
          ) : null}
        </ControlCenterHeader>

        {sentToEmail ? (
          <div className="flex flex-col gap-4 text-start" aria-live="polite">
            <h2 className="text-lg font-semibold text-foreground">{t('auth:emailOtpSentTitle')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('auth:emailOtpSentBody', { email: sentToEmail })}
            </p>
            <EmailOtpVerifyForm email={sentToEmail} />
            <Button variant="ghost" className="self-start" onClick={() => setSentToEmail(null)}>
              {t('common:back')}
            </Button>
          </div>
        ) : mode === 'otp' ? (
          <div className="flex flex-col gap-4">
            <EmailOtpRequestForm onSent={setSentToEmail} />
            <Button variant="link" className="self-center" onClick={() => setMode('existing-code')}>
              {t('auth:emailOtpExistingCodeAction')}
            </Button>
            <Button variant="link" className="self-center" onClick={() => setMode('password')}>
              {t('auth:adminUsePasswordInstead')}
            </Button>
          </div>
        ) : mode === 'existing-code' ? (
          <div className="flex flex-col gap-4">
            <EmailOtpExistingCodeForm />
            <Button variant="link" className="self-center" onClick={() => setMode('otp')}>
              {t('auth:emailOtpNeedCodeAction')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <PasswordLoginForm />
            <Button variant="link" className="self-center" onClick={() => setMode('otp')}>
              {t('auth:adminUseEmailOtpInstead')}
            </Button>
          </div>
        )}
        <LanguageChoiceRow className="self-center" />
      </div>
    </main>
  );
}
