/**
 * Her own account (RAPP-634): her name, sign-in email, language and profile
 * photo, on one page opened from the user menu in the top bar.
 *
 * Every team member reaches it, the onboarding design role included: the
 * `_staff` layout already admits staff and admins, and the design role's
 * redirect leaves `/account` open (lib/design-role-access). No feature
 * permission gates it, because each section only touches her own account:
 *   - the name and photo are her own profile row, which the row policy lets
 *     her update (`profiles_update_self_no_escalation`);
 *   - the email is her Supabase Auth user (`auth.updateUser`), which changes
 *     only after she confirms from the email Supabase sends;
 *   - the language is the browser's language cookie (RAPP-238).
 * `ssr: false` for the reason every staff screen gives (the session lives in
 * localStorage, ADR-005).
 */
import { Page, PageHeader } from '@/components/layout/page';
import { ProfilePhotoEditor } from '@/components/nav/profile-photo-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { safeAsync } from '@/lib/observability';
import {
  fetchOwnEmailState,
  OWN_NAME_MAX_LENGTH,
  requestOwnEmailChange,
  setOwnName,
  useOwnAccount,
  type EmailChangeOutcome,
  type OwnAccount,
  type OwnEmailState,
} from '@/lib/own-account';
import { createFileRoute } from '@tanstack/react-router';
import { MailCheck } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAuth } from '@ramassa/shared/auth';
import {
  LANGUAGE_NATIVE_NAMES,
  STAFF_LANGUAGES,
  staffLanguageFor,
  useLanguage,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

export const Route = createFileRoute('/_staff/account')({
  ssr: false,
  component: AccountPage,
});

function AccountPage() {
  const { t } = useTranslation(['admin', 'common']);
  const { account, reload } = useOwnAccount();
  if (account === null) return null;

  return (
    <Page data-testid="account-page">
      <PageHeader title={t('admin:account.title')} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <NameCard account={account} onSaved={reload} />
        <EmailCard sessionEmail={account.email} />
        <LanguageCard />
        <Card data-testid="account-photo">
          <CardHeader>
            <CardTitle>{t('admin:userMenu.profilePhoto')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfilePhotoEditor account={account} onChanged={reload} layout="inline" />
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

type SaveStatus = 'idle' | 'working' | 'saved' | 'failed';

function NameCard({
  account,
  onSaved,
}: {
  readonly account: OwnAccount;
  readonly onSaved: () => void;
}) {
  const { t } = useTranslation('admin');
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [firstName, setFirstName] = useState(account.firstName);
  const [lastName, setLastName] = useState(account.lastName);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [showBlank, setShowBlank] = useState(false);
  // Her saved name arrives after the first render and changes after a save:
  // the fields follow it unless she has typed something else
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [shown, setShown] = useState({ first: account.firstName, last: account.lastName });
  if (shown.first !== account.firstName || shown.last !== account.lastName) {
    if (firstName === shown.first) setFirstName(account.firstName);
    if (lastName === shown.last) setLastName(account.lastName);
    setShown({ first: account.firstName, last: account.lastName });
  }

  const blank = firstName.trim() === '' || lastName.trim() === '';
  const unchanged =
    firstName.trim() === account.firstName.trim() && lastName.trim() === account.lastName.trim();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (userId === null || status === 'working') return;
    if (blank) {
      setShowBlank(true);
      return;
    }
    setStatus('working');
    const result = await safeAsync(() => setOwnName(userId, firstName, lastName), {
      context: { action: 'own-name' },
    });
    setStatus(result.ok ? 'saved' : 'failed');
    if (result.ok) {
      setFirstName(firstName.trim());
      setLastName(lastName.trim());
      setShowBlank(false);
      onSaved();
    }
  };

  return (
    <Card data-testid="account-name">
      <form onSubmit={(event) => void submit(event)} noValidate className="contents">
        <CardHeader>
          <CardTitle>{t('account.name.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={showBlank && firstName.trim() === ''}>
              <FieldLabel htmlFor="account-first-name">{t('account.name.firstName')}</FieldLabel>
              <Input
                id="account-first-name"
                autoComplete="given-name"
                maxLength={OWN_NAME_MAX_LENGTH}
                value={firstName}
                aria-invalid={showBlank && firstName.trim() === ''}
                data-testid="account-first-name"
                onChange={(event) => {
                  setFirstName(event.target.value);
                  setStatus('idle');
                }}
              />
            </Field>
            <Field data-invalid={showBlank && lastName.trim() === ''}>
              <FieldLabel htmlFor="account-last-name">{t('account.name.lastName')}</FieldLabel>
              <Input
                id="account-last-name"
                autoComplete="family-name"
                maxLength={OWN_NAME_MAX_LENGTH}
                value={lastName}
                aria-invalid={showBlank && lastName.trim() === ''}
                data-testid="account-last-name"
                onChange={(event) => {
                  setLastName(event.target.value);
                  setStatus('idle');
                }}
              />
            </Field>
          </FieldGroup>
          {showBlank && blank ? (
            <FieldError className="mt-3">{t('account.name.required')}</FieldError>
          ) : null}
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <SaveMessage
            status={status}
            saved={t('account.name.saved')}
            failed={t('account.name.failed')}
          />
          <Button
            type="submit"
            disabled={unchanged || status === 'working'}
            data-testid="account-name-save"
          >
            {status === 'working' ? t('account.saving') : t('account.save')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SaveMessage({
  status,
  saved,
  failed,
}: {
  readonly status: SaveStatus;
  readonly saved: string;
  readonly failed: string;
}) {
  return (
    <div className="min-h-5 min-w-0 text-sm">
      <p role="status" className="text-muted-foreground">
        {status === 'saved' ? saved : null}
      </p>
      {status === 'failed' ? (
        <p role="alert" className="text-destructive">
          {failed}
        </p>
      ) : null}
    </div>
  );
}

type EmailProblem = Exclude<EmailChangeOutcome, 'sent'> | 'same';

const EMAIL_PROBLEM_KEY: Record<EmailProblem, string> = {
  same: 'account.email.same',
  taken: 'account.email.taken',
  invalid: 'account.email.invalid',
  'rate-limited': 'account.email.rateLimited',
  failed: 'account.email.failed',
};

const emailSchema = z.email();

function EmailCard({ sessionEmail }: { readonly sessionEmail: string }) {
  const { t } = useTranslation('admin');
  const [state, setState] = useState<OwnEmailState>({ email: sessionEmail, pendingEmail: null });
  const [next, setNext] = useState('');
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<EmailProblem | null>(null);

  const refresh = useCallback(async () => {
    const result = await safeAsync(() => fetchOwnEmailState(sessionEmail), {
      context: { action: 'own-email-state' },
    });
    if (result.ok) setState(result.value);
  }, [sessionEmail]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (working) return;
    const email = next.trim().toLowerCase();
    if (!emailSchema.safeParse(email).success) {
      setProblem('invalid');
      return;
    }
    if (email === state.email.toLowerCase()) {
      setProblem('same');
      return;
    }
    setWorking(true);
    setProblem(null);
    const outcome = await requestOwnEmailChange(email);
    setWorking(false);
    if (outcome === 'sent') {
      setNext('');
      setState((current) => ({ ...current, pendingEmail: email }));
      void refresh();
    } else {
      setProblem(outcome);
    }
  };

  return (
    <Card data-testid="account-email">
      <form onSubmit={(event) => void submit(event)} noValidate className="contents">
        <CardHeader>
          <CardTitle>{t('account.email.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-1 text-sm">
            <dt className="text-muted-foreground">{t('account.email.current')}</dt>
            <dd className="font-medium break-all" data-testid="account-email-current">
              {state.email}
            </dd>
          </dl>
          {state.pendingEmail === null ? null : (
            <Alert data-testid="account-email-pending" role="status">
              <MailCheck aria-hidden="true" />
              <AlertTitle>{t('account.email.pendingTitle')}</AlertTitle>
              <AlertDescription>
                {t('account.email.pendingBody', {
                  email: state.pendingEmail,
                  current: state.email,
                })}
              </AlertDescription>
            </Alert>
          )}
          <Field data-invalid={problem !== null}>
            <FieldLabel htmlFor="account-new-email">{t('account.email.new')}</FieldLabel>
            <Input
              id="account-new-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              dir="ltr"
              value={next}
              aria-invalid={problem !== null}
              aria-describedby={problem === null ? undefined : 'account-new-email-problem'}
              data-testid="account-new-email"
              onChange={(event) => {
                setNext(event.target.value);
                setProblem(null);
              }}
            />
            {problem === null ? null : (
              <FieldError id="account-new-email-problem">
                {t(EMAIL_PROBLEM_KEY[problem])}
              </FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="submit"
            disabled={working || next.trim() === ''}
            data-testid="account-email-submit"
          >
            {working ? t('account.email.sending') : t('account.email.submit')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function LanguageCard() {
  const { t } = useTranslation('common');
  const { language, setLanguage } = useLanguage();
  const current = staffLanguageFor(language);
  const label = t('interfaceLanguageLabel');

  return (
    <Card data-testid="account-language">
      <CardHeader>
        <CardTitle id="account-language-title">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={current}
          onValueChange={(value) => void setLanguage(value as SupportedLanguage)}
          aria-labelledby="account-language-title"
          className="grid gap-3 sm:grid-cols-3"
        >
          {STAFF_LANGUAGES.map((code) => (
            <FieldLabel key={code} htmlFor={`account-language-${code}`}>
              <Field orientation="horizontal">
                <FieldTitle lang={code} className="flex-1">
                  {LANGUAGE_NATIVE_NAMES[code]}
                </FieldTitle>
                <RadioGroupItem
                  value={code}
                  id={`account-language-${code}`}
                  data-testid={`language-choice-${code}`}
                />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
