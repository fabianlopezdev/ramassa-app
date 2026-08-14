/**
 * Creating a participant's ACCESS (RAPP-25): one question first — does she
 * have an email? — then one of two arms.
 *
 * With an email, staff record an INVITATION: she signs in with a magic link to
 * her own inbox, and the invite (bound to her ADDRESS, not to a link token)
 * carries the referring entity into her wizard as an editable default. With no
 * email, the SERVER mints an internal address and a one-time password; staff
 * never type a domain, so there is no rule to remember and no way to get it
 * wrong.
 *
 * The two arms are explicit components rather than one form with a boolean:
 * they share a question, not a shape. The result panels replace the form
 * because both end states carry something that must be READ (credentials shown
 * exactly once; the expiry of an invite), not toasted over.
 *
 * Nothing here stores, logs or interpolates the generated password: it lives
 * in component state for exactly as long as the panel is on screen, and the
 * panel says so out loud.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { CopyableCredential } from '@/components/participants/copyable-credential';
import { finishParticipantAccountCreation } from '@/components/participants/participant-account-completion';
import { Button } from '@/components/ui/button';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  createParticipantAccount,
  createParticipantInvite,
  type CreatedParticipantAccount,
  type CreatedParticipantInvite,
} from '@ramassa/shared/accounts';
import { completeReferral, type Referral } from '@ramassa/shared/referrals';
import {
  buildCreateParticipantAccountPayload,
  buildCreateParticipantInvitePayload,
  createParticipantAccountSchema,
  createParticipantInviteSchema,
  type CreateParticipantAccount,
  type CreateParticipantAccountInput,
  type CreateParticipantInvite,
  type CreateParticipantInviteInput,
} from '@ramassa/shared/schemas';

type Arm = 'invite' | 'create';

export function NewParticipant({ referral = null }: { readonly referral?: Referral | null }) {
  const { t } = useTranslation(['participants', 'auth', 'onboarding', 'referrals']);
  const [arm, setArm] = useState<Arm | null>(null);
  const [createdAccount, setCreatedAccount] = useState<CreatedParticipantAccount | null>(null);
  const [createdInvite, setCreatedInvite] = useState<CreatedParticipantInvite | null>(null);
  const [completionFailed, setCompletionFailed] = useState(false);

  function startOver(nextArm: Arm | null) {
    setCreatedAccount(null);
    setCreatedInvite(null);
    setArm(nextArm);
  }

  async function finishCreatedAccount(account: CreatedParticipantAccount) {
    setCompletionFailed(false);
    await finishParticipantAccountCreation(account, {
      showAccount: setCreatedAccount,
      linkReferral:
        referral === null
          ? undefined
          : async () => {
              const linked = await safeAsync(() =>
                completeReferral(supabase, referral.id, account.profile_id),
              );
              return linked.ok;
            },
      showLinkFailure: () => setCompletionFailed(true),
    });
  }

  return (
    <section className="flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <Link
          to="/participants"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {t('detailBackToList')}
        </Link>
        <h1 className="text-start text-2xl font-semibold">{t('newTitle')}</h1>
      </header>

      {completionFailed ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t('referrals:saveError')}
        </p>
      ) : null}

      {createdAccount !== null ? (
        <CredentialsPanel account={createdAccount} onCreateAnother={() => startOver('create')} />
      ) : createdInvite !== null ? (
        <InvitedPanel invite={createdInvite} onInviteAnother={() => startOver('invite')} />
      ) : (
        <>
          {referral === null ? null : (
            <div className="rounded-xl border bg-muted p-4" data-testid="referral-prefill">
              <p className="text-start font-medium">
                {referral.referredFirstName} {referral.referredLastName}
              </p>
              <p className="mt-1 text-start text-sm text-muted-foreground">
                {t('referrals:completionHelp')}
              </p>
            </div>
          )}
          <fieldset className="flex flex-col gap-3">
            <legend className="text-start text-base font-medium">{t('forkQuestion')}</legend>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                size="lg"
                variant={arm === 'invite' ? 'default' : 'outline'}
                aria-pressed={arm === 'invite'}
                onClick={() => setArm('invite')}
              >
                {t('forkHasEmail')}
              </Button>
              <Button
                type="button"
                size="lg"
                variant={arm === 'create' ? 'default' : 'outline'}
                aria-pressed={arm === 'create'}
                onClick={() => setArm('create')}
              >
                {t('forkNoEmail')}
              </Button>
            </div>
          </fieldset>

          {arm === 'invite' ? (
            <InviteForm
              onInvited={setCreatedInvite}
              initialReferenceEntity={referral?.entityName ?? ''}
            />
          ) : null}
          {arm === 'create' ? (
            <CreateAccountForm onCreated={finishCreatedAccount} referral={referral} />
          ) : null}
        </>
      )}
    </section>
  );
}

/** The no-email arm: names in, one-time credentials out. */
function CreateAccountForm({
  onCreated,
  referral,
}: {
  readonly onCreated: (account: CreatedParticipantAccount) => Promise<void>;
  readonly referral: Referral | null;
}) {
  const { t } = useTranslation(['participants', 'onboarding']);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | undefined>(undefined);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateParticipantAccountInput, unknown, CreateParticipantAccount>({
    resolver: zodResolver(createParticipantAccountSchema),
    defaultValues: {
      firstName: referral?.referredFirstName ?? '',
      lastName: referral?.referredLastName ?? '',
      referenceEntity: referral?.entityName ?? '',
    },
  });

  const create = handleSubmit(async (input) => {
    setSubmitErrorMessage(undefined);
    const result = await safeAsync(() =>
      createParticipantAccount(supabase, buildCreateParticipantAccountPayload(input)),
    );
    if (!result.ok) {
      setSubmitErrorMessage(t('createAccountFailed'));
      return;
    }
    await onCreated(result.value);
  });

  return (
    <form onSubmit={(event) => void create(event)} noValidate className="flex flex-col gap-4">
      <p className="text-start text-sm text-muted-foreground">{t('createAccountIntro')}</p>
      <Controller
        control={control}
        name="firstName"
        render={({ field }) => (
          <AdminAuthField
            id="new-participant-first-name"
            label={t('onboarding:firstNameLabel')}
            errorMessage={errors.firstName ? t('onboarding:errorRequired') : undefined}
            value={field.value ?? ''}
            onChange={(event) => field.onChange(event.target.value)}
            onBlur={field.onBlur}
            ref={field.ref}
          />
        )}
      />
      <Controller
        control={control}
        name="lastName"
        render={({ field }) => (
          <AdminAuthField
            id="new-participant-last-name"
            label={t('onboarding:lastNameLabel')}
            errorMessage={errors.lastName ? t('onboarding:errorRequired') : undefined}
            value={field.value ?? ''}
            onChange={(event) => field.onChange(event.target.value)}
            onBlur={field.onBlur}
            ref={field.ref}
          />
        )}
      />
      <Controller
        control={control}
        name="referenceEntity"
        render={({ field }) => (
          <EntityField
            id="new-participant-entity"
            value={field.value ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {t('createAccountAction')}
        </Button>
        {submitErrorMessage === undefined ? null : (
          <p aria-live="polite" className="text-start text-sm text-destructive">
            {submitErrorMessage}
          </p>
        )}
      </div>
    </form>
  );
}

/** The email arm: an address in, a recorded 30-day invitation out. */
function InviteForm({
  onInvited,
  initialReferenceEntity,
}: {
  readonly onInvited: (invite: CreatedParticipantInvite) => void;
  readonly initialReferenceEntity: string;
}) {
  const { t } = useTranslation(['participants', 'auth']);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | undefined>(undefined);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateParticipantInviteInput, unknown, CreateParticipantInvite>({
    resolver: zodResolver(createParticipantInviteSchema),
    defaultValues: { email: '', referenceEntity: initialReferenceEntity },
  });

  const invite = handleSubmit(async (input) => {
    setSubmitErrorMessage(undefined);
    const result = await safeAsync(() =>
      createParticipantInvite(supabase, buildCreateParticipantInvitePayload(input)),
    );
    if (!result.ok) {
      setSubmitErrorMessage(t('inviteFailed'));
      return;
    }
    onInvited(result.value);
  });

  return (
    <form onSubmit={(event) => void invite(event)} noValidate className="flex flex-col gap-4">
      <p className="text-start text-sm text-muted-foreground">{t('inviteIntro')}</p>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <AdminAuthField
            id="new-participant-email"
            label={t('auth:emailLabel')}
            type="email"
            placeholder={t('auth:emailPlaceholder')}
            errorMessage={errors.email ? t('inviteEmailError') : undefined}
            value={field.value ?? ''}
            onChange={(event) => field.onChange(event.target.value)}
            onBlur={field.onBlur}
            ref={field.ref}
          />
        )}
      />
      <Controller
        control={control}
        name="referenceEntity"
        render={({ field }) => (
          <EntityField
            id="new-invite-entity"
            value={field.value ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {t('inviteAction')}
        </Button>
        {submitErrorMessage === undefined ? null : (
          <p aria-live="polite" className="text-start text-sm text-destructive">
            {submitErrorMessage}
          </p>
        )}
      </div>
    </form>
  );
}

interface EntityFieldProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
}

/**
 * The one field the two arms genuinely share, with the hint that explains what
 * it does: the entity is a DEFAULT in her wizard, hers to change, never a fact
 * recorded about her here. Presentational on purpose — each arm owns its own
 * Controller, because the two forms share a field, not a shape.
 */
function EntityField({ id, value, onChange, onBlur }: EntityFieldProps) {
  const { t } = useTranslation('participants');
  return (
    <div className="flex flex-col gap-1.5">
      <AdminAuthField
        id={id}
        label={t('entityOptionalLabel')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <p className="text-start text-sm text-muted-foreground">{t('entityPrefillHint')}</p>
    </div>
  );
}

/**
 * The only sighting of the password there will ever be. The panel says so, and
 * offers the two things staff do next: hand the slip over and open her record,
 * or create the next account.
 */
function CredentialsPanel({
  account,
  onCreateAnother,
}: {
  readonly account: CreatedParticipantAccount;
  readonly onCreateAnother: () => void;
}) {
  const { t } = useTranslation('participants');
  return (
    <section aria-live="polite" className="flex flex-col gap-4 rounded-md border p-6">
      <h2 className="text-start text-xl font-semibold">{t('credentialsTitle')}</h2>
      <p className="text-start text-sm font-medium text-destructive">{t('credentialsShownOnce')}</p>
      <CopyableCredential label={t('credentialsAddressLabel')} value={account.email} />
      <CopyableCredential label={t('credentialsPasswordLabel')} value={account.password} />
      <p className="text-start text-sm text-muted-foreground">{t('credentialsTermsNote')}</p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link to="/participants/$participantId" params={{ participantId: account.profile_id }}>
            {t('credentialsOpenRecord')}
          </Link>
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={onCreateAnother}>
          {t('createAnotherAction')}
        </Button>
      </div>
    </section>
  );
}

function InvitedPanel({
  invite,
  onInviteAnother,
}: {
  readonly invite: CreatedParticipantInvite;
  readonly onInviteAnother: () => void;
}) {
  const { t, i18n } = useTranslation('participants');
  const locale = i18n.resolvedLanguage ?? 'ca';
  return (
    <section aria-live="polite" className="flex flex-col gap-4 rounded-md border p-6">
      <h2 className="text-start text-xl font-semibold">{t('invitedTitle')}</h2>
      <p className="text-start text-sm">{t('invitedBody', { email: invite.email })}</p>
      <p className="text-start text-sm text-muted-foreground">
        {t('invitedExpires', { date: new Date(invite.expires_at).toLocaleDateString(locale) })}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg" variant="outline">
          <Link to="/participants/invites">{t('invitesAction')}</Link>
        </Button>
        <Button type="button" size="lg" onClick={onInviteAnother}>
          {t('inviteAnotherAction')}
        </Button>
      </div>
    </section>
  );
}
