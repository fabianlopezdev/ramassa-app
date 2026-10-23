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
 *
 * Two steps (RAPP-618): her details, then what her guided registration will ask
 * when she opens the app, which staff confirm or change before the invitation
 * is created. Both are saved together, in one database call.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { Page } from '@/components/layout/page';
import { InviteQuestionsReview } from '@/components/participants/invite-questions-review';
import { TestPlayerOption } from '@/components/participants/test-player-option';
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
import { useAuth } from '@ramassa/shared/auth';
import {
  allowedQuestionStates,
  answeredAtInvitation,
  type QuestionStates,
} from '@ramassa/shared/intake';
import {
  allowedCustomQuestionStates,
  requiredBuiltinQuestions,
  type CustomQuestionStates,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import { isLimitedToTestPlayers, testPlayerOption } from '@ramassa/shared/permissions';
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
  catalog,
  entityAnswerKeys = [],
}: {
  readonly referral?: Referral | null;
  /** What the entity answered to the questions staff added (RAPP-307). */
  readonly custom?: ReferralCustomAnswersProps;
  /** The organization's question catalog, which plans her wizard (RAPP-307). */
  readonly catalog: IntakeCatalog;
  /** Her profile fields the referral answers (RAPP-618). */
  readonly entityAnswerKeys?: readonly string[];
}) {
  const { t } = useTranslation(['participants', 'referrals']);
  const [createdInvite, setCreatedInvite] = useState<CreatedParticipantInvite | null>(null);
  // Her details, once staff move on to the questions; kept when they go back.
  const [details, setDetails] = useState<CreateParticipantInvite | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const referralId = referral?.id ?? null;

  return (
    <Page>
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
          onInviteAnother={() => {
            setCreatedInvite(null);
            setDetails(null);
            setIsReviewing(false);
          }}
        />
      ) : isReviewing && details !== null ? (
        <InviteQuestionsStep
          details={details}
          referralId={referralId}
          catalog={catalog}
          entityAnswerKeys={entityAnswerKeys}
          onBack={() => setIsReviewing(false)}
          onInvited={setCreatedInvite}
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
            onReview={(input) => {
              setDetails(input);
              setIsReviewing(true);
            }}
            referralId={referralId}
            initial={
              details ?? {
                email: referral?.referredEmail ?? '',
                firstName: referral?.referredFirstName ?? '',
                lastName: referral?.referredLastName ?? '',
                referenceEntity: referral?.entityName ?? '',
              }
            }
          />
        </>
      )}
    </Page>
  );
}

/**
 * Her name and address in (RAPP-300). The next step shows what her wizard will
 * ask; the invitation is created there.
 */
function InviteForm({
  onReview,
  referralId,
  initial,
}: {
  readonly onReview: (input: CreateParticipantInvite) => void;
  readonly referralId: string | null;
  /**
   * What the form opens with: the referral's answers, or what staff typed
   * before going to the questions and back. The address the entity gave is
   * cleared on the referral when she is invited (RAPP-303).
   */
  readonly initial: CreateParticipantInviteInput;
}) {
  const { t } = useTranslation(['participants', 'auth', 'onboarding']);
  const { permissions } = useAuth();
  // A test player (RAPP-615) answers no real referral, so the option stays out
  // of an invitation that carries one.
  const testOption = referralId === null ? testPlayerOption(permissions) : 'hidden';

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateParticipantInviteInput, unknown, CreateParticipantInvite>({
    resolver: zodResolver(createParticipantInviteSchema),
    defaultValues: {
      ...initial,
      isTestAccount: testOption === 'forced' || initial.isTestAccount === true,
    },
  });

  const review = handleSubmit((input) => onReview(input));

  return (
    <form onSubmit={(event) => void review(event)} noValidate className="flex flex-col gap-4">
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
      {testOption === 'hidden' ? null : (
        <Controller
          control={control}
          name="isTestAccount"
          render={({ field }) => (
            <TestPlayerOption
              mode={testOption}
              checked={field.value === true}
              onChange={field.onChange}
            />
          )}
        />
      )}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={isSubmitting}>
          {t('inviteReviewAction')}
        </Button>
      </div>
    </form>
  );
}

/**
 * The last step (RAPP-618): what she will be asked, from what staff entered,
 * and the invitation itself. The confirmed choices are saved with it, in the
 * same database call, so a refused choice leaves no invitation behind.
 */
function InviteQuestionsStep({
  details,
  referralId,
  catalog,
  entityAnswerKeys,
  onBack,
  onInvited,
}: {
  readonly details: CreateParticipantInvite;
  readonly referralId: string | null;
  readonly catalog: IntakeCatalog;
  readonly entityAnswerKeys: readonly string[];
  readonly onBack: () => void;
  readonly onInvited: (invite: CreatedParticipantInvite) => void;
}) {
  const { t } = useTranslation(['participants', 'common']);
  const [states, setStates] = useState<QuestionStates>({});
  // Her choices on Ramassà's own questions (RAPP-643), sent with the app's own.
  const [customStates, setCustomStates] = useState<CustomQuestionStates>({});
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const basePayload = buildCreateParticipantInvitePayload(details, referralId);
  // A test player answers no referral, so the entity's answers do not reach her.
  const answered = answeredAtInvitation(
    basePayload,
    basePayload.referral_id === null ? [] : entityAnswerKeys,
  );

  async function create() {
    setErrorMessage(undefined);
    setIsCreating(true);
    const result = await safeAsync(() =>
      createParticipantInvite(
        supabase,
        buildCreateParticipantInvitePayload(details, referralId, {
          ...allowedQuestionStates(states, answered, requiredBuiltinQuestions(catalog)),
          ...allowedCustomQuestionStates(customStates, catalog),
        }),
      ),
    );
    setIsCreating(false);
    if (!result.ok) {
      setErrorMessage(
        result.error.context.reason === INVITE_ALREADY_HAS_ACCOUNT
          ? t('inviteAlreadyHasAccount')
          : t('inviteFailed'),
      );
      return;
    }
    onInvited(result.value);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-start text-sm">
        {t('inviteQuestionsFor', {
          name: `${details.firstName} ${details.lastName}`,
          email: details.email,
        })}
      </p>
      <InviteQuestionsReview
        answered={answered}
        states={states}
        onChange={setStates}
        customStates={customStates}
        onCustomChange={setCustomStates}
        catalog={catalog}
      />
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          size="lg"
          className="h-12 w-full sm:w-auto"
          disabled={isCreating}
          onClick={() => void create()}
        >
          {t('inviteAction')}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-12 w-full sm:w-auto"
          onClick={onBack}
        >
          {t('inviteBackAction')}
        </Button>
        {errorMessage === undefined ? null : (
          <p aria-live="polite" className="text-start text-sm text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
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
  const { permissions } = useAuth();
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
        {isLimitedToTestPlayers(permissions) ? null : (
          <Button asChild size="lg" variant="outline" className="h-12 w-full sm:w-auto">
            <Link to="/participants/invites">{t('invitesAction')}</Link>
          </Button>
        )}
        <Button type="button" size="lg" className="h-12 w-full sm:w-auto" onClick={onInviteAnother}>
          {t('inviteAnotherAction')}
        </Button>
      </div>
    </section>
  );
}
