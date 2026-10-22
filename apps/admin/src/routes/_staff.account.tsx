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
import { AccountAvatar } from '@/components/nav/account-avatar';
import { useOwnProfilePhoto } from '@/components/nav/profile-photo-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Camera, MailCheck, Trash2 } from 'lucide-react';
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
  const { t } = useTranslation('admin');
  const { account, reload } = useOwnAccount();
  if (account === null) return null;

  return (
    // The email field, its button and the language select share one height
    // (h-9, the input's), so the second row lines up control for control.
    <Page data-testid="account-page">
      <PageHeader title={t('account.title')} />
      <ProfileCard account={account} onSaved={reload} />
      {/* Grid items stretch by default; with h-full on both cards they keep
        one height whatever either holds (RAPP-634). */}
      <div className="grid gap-6 md:grid-cols-2 md:items-stretch">
        <EmailCard sessionEmail={account.email} />
        <LanguageCard />
      </div>
    </Page>
  );
}

type SaveStatus = 'idle' | 'working' | 'saved' | 'failed';

/**
 * Her photo and her name together, the way GitHub and Notion show a profile:
 * the photo applies at once, the name with Save.
 */
function ProfileCard({
  account,
  onSaved,
}: {
  readonly account: OwnAccount;
  readonly onSaved: () => void;
}) {
  const { t } = useTranslation('admin');
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const photo = useOwnProfilePhoto(onSaved);
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
    <Card data-testid="account-profile">
      <form onSubmit={(event) => void submit(event)} noValidate className="contents">
        <CardHeader>
          <CardTitle>{t('account.profile.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div className="flex flex-col items-center gap-3" data-testid="account-photo">
            <AccountAvatar
              account={account}
              className="size-24 ring-4 ring-primary/10"
              fallbackClassName="text-2xl"
            />
            {photo.fileInput}
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={photo.working}
                data-testid="profile-photo-choose"
                onClick={photo.choose}
              >
                <Camera aria-hidden="true" />
                {account.avatarUrl === null ? t('profilePhoto.choose') : t('profilePhoto.replace')}
              </Button>
              {account.avatarUrl === null ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={photo.working}
                  data-testid="profile-photo-remove"
                  onClick={photo.remove}
                >
                  <Trash2 aria-hidden="true" />
                  {t('profilePhoto.remove')}
                </Button>
              )}
            </div>
            <p role="status" className="min-h-4 text-center text-xs text-muted-foreground">
              {photo.message}
            </p>
            {photo.problem === null ? null : (
              <p role="alert" className="max-w-56 text-center text-xs text-destructive">
                {photo.problem}
              </p>
            )}
          </div>
          <FieldGroup className="grid content-center gap-4 md:grid-cols-2">
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
            {showBlank && blank ? (
              <FieldError className="md:col-span-2">{t('account.name.required')}</FieldError>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <div className="min-h-5 min-w-0 text-sm">
            <p role="status" className="text-muted-foreground">
              {status === 'saved' ? t('account.name.saved') : null}
            </p>
            {status === 'failed' ? (
              <p role="alert" className="text-destructive">
                {t('account.name.failed')}
              </p>
            ) : null}
          </div>
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

type EmailProblem = Exclude<EmailChangeOutcome, 'sent'> | 'same';

const EMAIL_PROBLEM_KEY: Record<EmailProblem, string> = {
  same: 'account.email.same',
  taken: 'account.email.taken',
  invalid: 'account.email.invalid',
  'rate-limited': 'account.email.rateLimited',
  failed: 'account.email.failed',
};

const emailSchema = z.email();

/** Her sign-in email, changed through a dialog the way Vercel and Linear do it. */
function EmailCard({ sessionEmail }: { readonly sessionEmail: string }) {
  const { t } = useTranslation('admin');
  const [state, setState] = useState<OwnEmailState>({ email: sessionEmail, pendingEmail: null });
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    const result = await safeAsync(() => fetchOwnEmailState(sessionEmail), {
      context: { action: 'own-email-state' },
    });
    if (result.ok) setState(result.value);
  }, [sessionEmail]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Card className="h-full" data-testid="account-email">
      <CardHeader>
        <CardTitle id="account-email-title">{t('account.email.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            readOnly
            value={state.email}
            dir="ltr"
            aria-labelledby="account-email-title"
            className="h-9 min-w-0 flex-1 bg-muted/40"
            data-testid="account-email-current"
          />
          <Button
            type="button"
            variant="outline"
            className="h-9"
            data-testid="account-email-change"
            onClick={() => setDialogOpen(true)}
          >
            {t('account.email.change')}
          </Button>
        </div>
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
      </CardContent>
      <EmailChangeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentEmail={state.email}
        onSent={(email) => {
          setState((current) => ({ ...current, pendingEmail: email }));
          void refresh();
        }}
      />
    </Card>
  );
}

function EmailChangeDialog({
  open,
  onOpenChange,
  currentEmail,
  onSent,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentEmail: string;
  readonly onSent: (email: string) => void;
}) {
  const { t } = useTranslation('admin');
  const [next, setNext] = useState('');
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<EmailProblem | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (working) return;
    const email = next.trim().toLowerCase();
    if (!emailSchema.safeParse(email).success) {
      setProblem('invalid');
      return;
    }
    if (email === currentEmail.toLowerCase()) {
      setProblem('same');
      return;
    }
    setWorking(true);
    setProblem(null);
    const outcome = await requestOwnEmailChange(email);
    setWorking(false);
    if (outcome === 'sent') {
      setNext('');
      onOpenChange(false);
      onSent(email);
    } else {
      setProblem(outcome);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setNext('');
          setProblem(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="account-email-dialog">
        <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
          <DialogTitle>{t('account.email.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('account.email.dialogBody')}</DialogDescription>
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
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('account.cancel')}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={working || next.trim() === ''}
              data-testid="account-email-submit"
            >
              {working ? t('account.email.sending') : t('account.email.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A preference: it applies the moment she picks it, with no Save. */
function LanguageCard() {
  const { t } = useTranslation('common');
  const { language, setLanguage } = useLanguage();
  const current = staffLanguageFor(language);

  return (
    <Card className="h-full" data-testid="account-language">
      <CardHeader>
        <CardTitle id="account-language-title">{t('interfaceLanguageLabel')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Select
          value={current}
          onValueChange={(value) => void setLanguage(value as SupportedLanguage)}
        >
          <SelectTrigger
            aria-labelledby="account-language-title"
            className="w-full rounded-md shadow-xs data-[size=default]:h-9"
            data-testid="account-language-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAFF_LANGUAGES.map((code) => (
              <SelectItem
                key={code}
                value={code}
                lang={code}
                data-testid={`language-choice-${code}`}
              >
                {LANGUAGE_NATIVE_NAMES[code]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
