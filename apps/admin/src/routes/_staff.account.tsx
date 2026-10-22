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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field';
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
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
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

/**
 * The layout follows shadcn's `field-responsive` example: one setting per
 * row, the label and its description at the start, the control at the end.
 * Every control sits in a column of one fixed width (25rem from the field
 * group's `md` container size), so each control starts at the same x and
 * keeps its natural size on a wide monitor. Below that size the row stacks
 * the label above the control.
 */
const CONTROL_COLUMN = 'flex w-full flex-col gap-3 @md/field-group:w-100!';

function SettingRow({
  label,
  labelFor,
  description,
  testId,
  children,
}: {
  readonly label: string;
  /** The control the label names, when there is one input to point at. */
  readonly labelFor?: string;
  readonly description?: string;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  return (
    <Field orientation="responsive" data-testid={testId}>
      <FieldContent>
        {labelFor === undefined ? (
          <FieldLabel asChild>
            <span>{label}</span>
          </FieldLabel>
        ) : (
          <FieldLabel htmlFor={labelFor}>{label}</FieldLabel>
        )}
        {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <div className={CONTROL_COLUMN}>{children}</div>
    </Field>
  );
}

type SaveStatus = 'idle' | 'working' | 'saved' | 'failed';

function AccountPage() {
  const { account, reload } = useOwnAccount();
  if (account === null) return null;
  return <AccountForm account={account} onSaved={reload} />;
}

function AccountForm({
  account,
  onSaved,
}: {
  readonly account: OwnAccount;
  readonly onSaved: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
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
    <Page data-testid="account-page">
      <PageHeader title={t('admin:account.title')} />
      <div className="w-full max-w-4xl">
        <form
          onSubmit={(event) => void submit(event)}
          noValidate
          className="rounded-xl border bg-card p-4 text-card-foreground sm:p-6"
        >
          <FieldSet>
            <FieldLegend className="sr-only">{t('admin:account.title')}</FieldLegend>
            <FieldGroup>
              <SettingRow
                label={t('admin:userMenu.profilePhoto')}
                description={t('admin:account.photo.description')}
                testId="account-photo"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <AccountAvatar
                    account={account}
                    className="size-16 ring-4 ring-primary/10"
                    fallbackClassName="text-lg"
                  />
                  {photo.fileInput}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={photo.working}
                      data-testid="profile-photo-choose"
                      onClick={photo.choose}
                    >
                      <Camera aria-hidden="true" />
                      {account.avatarUrl === null
                        ? t('admin:profilePhoto.choose')
                        : t('admin:profilePhoto.replace')}
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
                        {t('admin:profilePhoto.remove')}
                      </Button>
                    )}
                  </div>
                </div>
                {photo.message === null ? null : (
                  <p role="status" className="text-sm text-muted-foreground">
                    {photo.message}
                  </p>
                )}
                {photo.problem === null ? null : (
                  <p role="alert" className="text-sm text-destructive">
                    {photo.problem}
                  </p>
                )}
              </SettingRow>

              <FieldSeparator />

              <SettingRow
                label={t('admin:account.name.label')}
                labelFor="account-first-name"
                testId="account-name"
              >
                {/* Two halves of the 25rem column: 12rem each, about w-48. */}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    id="account-first-name"
                    autoComplete="given-name"
                    maxLength={OWN_NAME_MAX_LENGTH}
                    value={firstName}
                    aria-label={t('admin:account.name.firstName')}
                    aria-invalid={showBlank && firstName.trim() === ''}
                    data-testid="account-first-name"
                    onChange={(event) => {
                      setFirstName(event.target.value);
                      setStatus('idle');
                    }}
                  />
                  <Input
                    id="account-last-name"
                    autoComplete="family-name"
                    maxLength={OWN_NAME_MAX_LENGTH}
                    value={lastName}
                    aria-label={t('admin:account.name.lastName')}
                    aria-invalid={showBlank && lastName.trim() === ''}
                    data-testid="account-last-name"
                    onChange={(event) => {
                      setLastName(event.target.value);
                      setStatus('idle');
                    }}
                  />
                </div>
                {showBlank && blank ? (
                  <FieldError>{t('admin:account.name.required')}</FieldError>
                ) : null}
              </SettingRow>

              <FieldSeparator />

              <EmailRow sessionEmail={account.email} />

              <FieldSeparator />

              <LanguageRow />

              <FieldSeparator />

              <Field orientation="responsive" className="@md/field-group:justify-end">
                <div className="min-w-0 text-sm @md/field-group:text-end">
                  <p role="status" className="text-muted-foreground">
                    {status === 'saved' ? t('admin:account.name.saved') : null}
                  </p>
                  {status === 'failed' ? (
                    <p role="alert" className="text-destructive">
                      {t('admin:account.name.failed')}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  disabled={unchanged || status === 'working'}
                  data-testid="account-name-save"
                >
                  {status === 'working' ? t('admin:account.saving') : t('admin:account.save')}
                </Button>
              </Field>
            </FieldGroup>
          </FieldSet>
        </form>
      </div>
    </Page>
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

/**
 * Her sign-in email, read-only with Change beside it. The change happens in a
 * dialog, the way Vercel and Linear do it, and waits for her confirmation.
 */
function EmailRow({ sessionEmail }: { readonly sessionEmail: string }) {
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
    <SettingRow
      label={t('account.email.title')}
      labelFor="account-email-current"
      description={t('account.email.description')}
      testId="account-email"
    >
      <div className="flex gap-2">
        <Input
          id="account-email-current"
          readOnly
          value={state.email}
          dir="ltr"
          className="min-w-0 flex-1 bg-muted/40"
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
      <EmailChangeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentEmail={state.email}
        onSent={(email) => {
          setState((current) => ({ ...current, pendingEmail: email }));
          void refresh();
        }}
      />
    </SettingRow>
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
    // The dialog renders in a portal, but React still bubbles its submit to
    // the page's name form, which would save the name too.
    event.stopPropagation();
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
function LanguageRow() {
  const { t } = useTranslation('common');
  const { language, setLanguage } = useLanguage();
  const current = staffLanguageFor(language);

  return (
    <SettingRow
      label={t('interfaceLanguageLabel')}
      labelFor="account-language-select"
      testId="account-language"
    >
      <Select
        value={current}
        onValueChange={(value) => void setLanguage(value as SupportedLanguage)}
      >
        <SelectTrigger
          id="account-language-select"
          className="w-full rounded-md shadow-xs data-[size=default]:h-9 @md/field-group:w-48"
          data-testid="account-language-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAFF_LANGUAGES.map((code) => (
            <SelectItem key={code} value={code} lang={code} data-testid={`language-choice-${code}`}>
              {LANGUAGE_NATIVE_NAMES[code]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
}
