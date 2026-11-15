/**
 * The team edits a participant's record on the phone (RAPP-281), with the same
 * fields, pickers and rules as her own edit screen and the web admin.
 *
 * It reads the card's cached record, so opening the form writes no second
 * audit row. A person without `participants.view_sensitive` gets no encrypted
 * fields: the form leaves them out and the database keeps the stored values.
 * The screen leaves only when the database says the save worked; a failed save
 * keeps her edits on screen with a message and a code.
 *
 * A woman who has not joined yet (RAPP-300) gets the prefill rules the web
 * admin uses: only what somebody answered shows, only her names are required,
 * no media consent (hers to give), and only the changed fields are sent,
 * because each one becomes a staff answer her wizard stops asking.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { FailureNotice } from '@/components/error-code-line';
import { CustomQuestionList } from '@/components/onboarding/custom-question-field';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { ProfileFormFields, type ProfileEditInput } from '@/components/profile/profile-form-fields';
import { playHaptic } from '@/lib/haptics/haptics';
import { useParticipantCard, useParticipantWrites } from '@/lib/participant-lookup';
import { participantFieldAccess } from '@/lib/participant-profile';
import { profileFormResetOptions } from '@/lib/profile-save';
import { supabase } from '@/lib/supabase';
import { useAccountAccess } from '@/lib/use-account-access';
import { useGenericAppFields } from '@/lib/use-generic-app-fields';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { withGenericAnswers } from '@ramassa/shared/intake-builder';
import {
  fetchParticipantAnsweredQuestions,
  hasJoined,
  prefillFormOf,
  prefillUpdateOf,
  profilePrefillSchema,
  type ProfilePrefill,
} from '@ramassa/shared/participants';
import {
  profileEditSchema,
  profileEditWithoutSensitiveSchema,
  profileFormOf,
  profileUpdateOf,
  type ProfileEdit,
} from '@ramassa/shared/schemas';

const fullResolver = zodResolver(profileEditSchema);
const withoutSensitiveResolver = zodResolver(profileEditWithoutSensitiveSchema);
// Same field names as the full form, so the shared fields render it; the
// schema differs (everything optional but the names).
const prefillResolver = zodResolver(profilePrefillSchema) as unknown as typeof fullResolver;

export default function ParticipantEditScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['participants', 'profile']);
  const languageFontClass = useLanguageFontClass();
  const { back } = useRouter();
  const access = participantFieldAccess(useAccountAccess().permissions);
  const card = useParticipantCard(id);
  const { updateProfile } = useParticipantWrites(id);
  const [isBlocked, setIsBlocked] = useState(false);
  const [failureCode, setFailureCode] = useState<AppErrorCode | null>(null);

  const isPrefill = card.data !== null && card.data !== undefined && !hasJoined(card.data);
  const answered = useQuery({
    queryKey: ['participants', id, 'answered-questions'],
    queryFn: () => fetchParticipantAnsweredQuestions(supabase, id),
    enabled: isPrefill,
  });
  // The app fields off their own control, asked with the generic renderer (RAPP-666).
  const generic = useGenericAppFields({
    stored: card.data?.answers ?? {},
    showSensitive: access.sensitive,
    enforceRequired: !isPrefill,
  });
  const values = useMemo(() => {
    if (card.data === null || card.data === undefined) return undefined;
    // Her answers read by field, through her organization's fields (RAPP-663).
    if (!isPrefill) return profileFormOf(card.data) as unknown as ProfileEditInput;
    return answered.data === undefined
      ? undefined
      : (prefillFormOf(card.data, answered.data) as unknown as ProfileEditInput);
  }, [answered.data, card.data, isPrefill]);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<ProfileEditInput, unknown, ProfileEdit>({
    resolver: isPrefill
      ? prefillResolver
      : access.sensitive
        ? fullResolver
        : withoutSensitiveResolver,
    values,
    // Edits in progress survive the card reloading underneath the form.
    resetOptions: profileFormResetOptions,
  });

  const save = handleSubmit(
    (edit) => {
      const genericAnswers = generic.check(t);
      if (genericAnswers === null) {
        setIsBlocked(true);
        playHaptic('warning');
        return;
      }
      setIsBlocked(false);
      setFailureCode(null);
      const fields = card.data?.fields ?? new Map();
      // Her answers travel by field (RAPP-663), the fields asked with the
      // generic renderer as staff gave them (RAPP-666).
      const payload = withGenericAnswers(
        isPrefill
          ? prefillUpdateOf(
              fields,
              edit as unknown as ProfilePrefill,
              new Set(Object.keys(dirtyFields)),
            )
          : profileUpdateOf(fields, edit),
        genericAnswers,
      );
      if (
        isPrefill &&
        Object.keys(payload).length === 1 &&
        Object.keys(payload.answers).length === 0
      ) {
        back();
        return;
      }
      updateProfile.mutate(payload, {
        onSuccess: () => {
          playHaptic('success');
          back();
        },
        onError: (error) => setFailureCode(toAppError(error).code),
      });
    },
    () => {
      setIsBlocked(true);
      playHaptic('warning');
    },
  );

  if (values === undefined || generic.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <AnnouncementFeedSkeleton accessibilityLabel={t('profile.editTitle')} />
      </SafeAreaView>
    );
  }

  return (
    <WizardFrame
      title={t('profile.editTitle')}
      intro={`${card.data?.first_name ?? ''} ${card.data?.last_name ?? ''}`.trim()}
      continueLabel={t('profile:saveAction')}
      onContinue={() => void save()}
      isContinueBusy={updateProfile.isPending}
      onBack={back}
    >
      <ProfileFormFields
        control={control}
        errors={errors}
        documentType={watch('documentType')}
        hasDependents={watch('hasDependents')}
        audience="staff"
        showSensitive={access.sensitive}
        showMediaConsent={!isPrefill}
        testIDPrefix="participant-edit"
        offTheirControl={generic.offTheirControl}
        offControlFields={
          generic.questions.length === 0 ? null : (
            <CustomQuestionList
              testID="participant-edit-fields"
              questions={generic.questions}
              answers={generic.answers}
              errors={generic.errors}
              onChange={generic.onChange}
            />
          )
        }
      />
      {access.sensitive ? null : (
        <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
          {t('profile.sensitiveHidden')}
        </Text>
      )}
      {isBlocked ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {t('profile:saveBlocked')}
        </Text>
      ) : null}
      {failureCode === null ? null : (
        <FailureNotice code={failureCode} message={t('profile.saveFailed')} />
      )}
    </WizardFrame>
  );
}
