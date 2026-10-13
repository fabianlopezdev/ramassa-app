/**
 * The team edits a participant's record on the phone (RAPP-281), with the same
 * fields, pickers and rules as her own edit screen and the web admin.
 *
 * It reads the card's cached record, so opening the form writes no second
 * audit row. A person without `participants.view_sensitive` gets no encrypted
 * fields: the form leaves them out and the database keeps the stored values.
 * The screen leaves only when the database says the save worked; a failed save
 * keeps her edits on screen with a message and a code.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { FailureNotice } from '@/components/error-code-line';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { ProfileFormFields, type ProfileEditInput } from '@/components/profile/profile-form-fields';
import { playHaptic } from '@/lib/haptics/haptics';
import { useParticipantCard, useParticipantWrites } from '@/lib/participant-lookup';
import { participantFieldAccess } from '@/lib/participant-profile';
import { profileFormResetOptions } from '@/lib/profile-save';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  buildUpdateOwnProfilePayload,
  profileEditSchema,
  profileEditWithoutSensitiveSchema,
  profileFromRow,
  type ProfileEdit,
} from '@ramassa/shared/schemas';

const fullResolver = zodResolver(profileEditSchema);
const withoutSensitiveResolver = zodResolver(profileEditWithoutSensitiveSchema);

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

  const values = useMemo(
    () =>
      card.data === null || card.data === undefined
        ? undefined
        : (profileFromRow(card.data) as ProfileEditInput),
    [card.data],
  );
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProfileEditInput, unknown, ProfileEdit>({
    resolver: access.sensitive ? fullResolver : withoutSensitiveResolver,
    values,
    // Edits in progress survive the card reloading underneath the form.
    resetOptions: profileFormResetOptions,
  });

  const save = handleSubmit(
    (edit) => {
      setIsBlocked(false);
      setFailureCode(null);
      updateProfile.mutate(buildUpdateOwnProfilePayload(edit), {
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

  if (values === undefined) {
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
        testIDPrefix="participant-edit"
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
