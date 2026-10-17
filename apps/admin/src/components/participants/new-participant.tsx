/**
 * Inviting a participant (RAPP-25, RAPP-224, RAPP-227).
 *
 * Every player joins with her own email. Staff record an invitation bound to
 * her ADDRESS (never to a link token); the database creates her empty account
 * at the same moment, so the first sign-in code she asks for reaches her. Her
 * profile is still written by the onboarding wizard, because the consent in it
 * is hers to give. A player without an email gets help creating one first.
 *
 * Opened from a partner entity's referral, the invitation also carries that
 * referral, and the database links it to her profile when she finishes the
 * wizard. The result panel replaces the form because its end state carries
 * something that must be READ (the invitation's expiry), not toasted over.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { ReferralAnswersList } from '@/components/referrals/referral-answers';
import {
  ReferralCustomAnswers,
  type ReferralCustomAnswersProps,
} from '@/components/referrals/referral-custom-answers';
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
  createParticipantInvite,
  INVITE_ALREADY_HAS_ACCOUNT,
  type CreatedParticipantInvite,
} from '@ramassa/shared/accounts';
import type { Referral } from '@ramassa/shared/referrals';
import {
  buildCreateParticipantInvitePayload,
  createParticipantInviteSchema,
  type CreateParticipantInvite,
  type CreateParticipantInviteInput,
} from '@ramassa/shared/schemas';

export function NewParticipant({
  referral = null,
  custom,
}: {
  readonly referral?: Referral | null;
  /** What the entity answered to the questions staff added (RAPP-307). */
  readonly custom?: ReferralCustomAnswersProps;
}) {
  const { t } = useTranslation(['participants', 'referrals']);
  const [createdInvite, setCreatedInvite] = useState<CreatedParticipantInvite | null>(null);

  return (
    <section className="flex w-full max-w-2xl flex-col gap-6 px-4 py-5 sm:p-6">
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

      {createdInvite !== null ? (
        <InvitedPanel
          invite={createdInvite}
          carriesReferral={referral !== null}
          onInviteAnother={() => setCreatedInvite(null)}
        />
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
              {/* What the entity answered fills her record when she is invited (RAPP-303). */}
              {referral.answers === null ? null : (
                <div className="mt-3">
                  <ReferralAnswersList answers={referral.answers} />
                </div>
              )}
              {custom === undefined ? null : (
                <div className="mt-3">
                  <ReferralCustomAnswers {...custom} />
                </div>
              )}
            </div>
          )}
          <InviteForm
            onInvited={setCreatedInvite}
            referralId={referral?.id ?? null}
            initialFirstName={referral?.referredFirstName ?? ''}
            initialLastName={referral?.referredLastName ?? ''}
            initialReferenceEntity={referral?.entityName ?? ''}
            initialEmail={referral?.referredEmail ?? ''}
          />
        </>
      )}
    </section>
  );
}

/**
 * Her name and address in; a recorded 30-day invitation, her account and her
 * profile out (RAPP-300). Staff then complete what they know on her record,
 * and her wizard asks only the rest.
 */
function InviteForm({
  onInvited,
  referralId,
  initialFirstName,
  initialLastName,
  initialReferenceEntity,
  initialEmail,
}: {
  readonly onInvited: (invite: CreatedParticipantInvite) => void;
  readonly referralId: string | null;
  readonly initialFirstName: string;
  readonly initialLastName: string;
  readonly initialReferenceEntity: string;
  /** The address the entity gave: accepting the referral clears it there (RAPP-303). */
  readonly initialEmail: string;
}) {
  const { t } = useTranslation(['participants', 'auth', 'onboarding']);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | undefined>(undefined);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateParticipantInviteInput, unknown, CreateParticipantInvite>({
    resolver: zodResolver(createParticipantInviteSchema),
    defaultValues: {
      email: initialEmail,
      firstName: initialFirstName,
      lastName: initialLastName,
      referenceEntity: initialReferenceEntity,
    },
  });

  const invite = handleSubmit(async (input) => {
    setSubmitErrorMessage(undefined);
    const result = await safeAsync(() =>
      createParticipantInvite(supabase, buildCreateParticipantInvitePayload(input, referralId)),
    );
    if (!result.ok) {
      setSubmitErrorMessage(
        result.error.context.reason === INVITE_ALREADY_HAS_ACCOUNT
          ? t('inviteAlreadyHasAccount')
          : t('inviteFailed'),
      );
      return;
    }
    onInvited(result.value);
  });

  return (
    <form onSubmit={(event) => void invite(event)} noValidate className="flex flex-col gap-4">
      <p className="text-start text-sm text-muted-foreground">{t('inviteIntro')}</p>
      <p className="text-start text-sm text-muted-foreground">{t('inviteNoEmailHint')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="firstName"
          render={({ field }) => (
            <AdminAuthField
              id="new-participant-first-name"
              label={t('onboarding:firstNameLabel')}
              autoComplete="off"
              errorMessage={errors.firstName ? t('inviteNameError') : undefined}
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
              autoComplete="off"
              errorMessage={errors.lastName ? t('inviteNameError') : undefined}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value)}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
      </div>
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
          <div className="flex flex-col gap-1.5">
            <AdminAuthField
              id="new-invite-entity"
              label={t('entityOptionalLabel')}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value)}
              onBlur={field.onBlur}
            />
            <p className="text-start text-sm text-muted-foreground">{t('entityPrefillHint')}</p>
          </div>
        )}
      />
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={isSubmitting}>
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

function InvitedPanel({
  invite,
  carriesReferral,
  onInviteAnother,
}: {
  readonly invite: CreatedParticipantInvite;
  readonly carriesReferral: boolean;
  readonly onInviteAnother: () => void;
}) {
  const { t, i18n } = useTranslation('participants');
  const locale = i18n.resolvedLanguage ?? 'ca';
  return (
    <section aria-live="polite" className="flex flex-col gap-4 rounded-md border p-4 sm:p-6">
      <h2 className="text-start text-xl font-semibold">{t('invitedTitle')}</h2>
      <p className="text-start text-sm">{t('invitedBody', { email: invite.email })}</p>
      {carriesReferral ? <p className="text-start text-sm">{t('invitedReferralNote')}</p> : null}
      <p className="text-start text-sm text-muted-foreground">
        {t('invitedExpires', { date: new Date(invite.expires_at).toLocaleDateString(locale) })}
      </p>
      {invite.profile_id === null ? null : (
        <p className="text-start text-sm">{t('invitedCompleteHint')}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
        {invite.profile_id === null ? null : (
          <Button asChild size="lg" className="h-12 w-full sm:w-auto">
            <Link to="/participants/$participantId" params={{ participantId: invite.profile_id }}>
              {t('invitedCompleteAction')}
            </Link>
          </Button>
        )}
        <Button asChild size="lg" variant="outline" className="h-12 w-full sm:w-auto">
          <Link to="/participants/invites">{t('invitesAction')}</Link>
        </Button>
        <Button type="button" size="lg" className="h-12 w-full sm:w-auto" onClick={onInviteAnother}>
          {t('inviteAnotherAction')}
        </Button>
      </div>
    </section>
  );
}
