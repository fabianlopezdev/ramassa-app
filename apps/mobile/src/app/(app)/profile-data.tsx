/**
 * Les meves dades (RAPP-22, RAPP-794): what Ramassà holds about her, in her
 * language, with her photo and the way to correct it. Opened from the profile
 * menu. Her consents live under "Privacitat i permisos", the only place she
 * changes them.
 */

import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { ProfilePhotoEditor } from '@/components/profile/profile-photo-editor';
import { ProfileScreenFrame } from '@/components/profile/profile-screen-frame';
import { ProfileRow, ProfileSection } from '@/components/profile/profile-section';
import { SeasonAnswerRows } from '@/components/profile/season-answer-rows';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { useOwnProfile } from '@ramassa/shared/profile';
import { profileFormOf } from '@ramassa/shared/schemas';

/**
 * How many section placeholders the loading state draws, one per real section
 * below. A skeleton, not a spinner (contract rule 14).
 */
const LOADING_SECTION_COUNT = 4;

export default function ProfileDataScreen() {
  const { t, i18n } = useTranslation(['profile', 'onboarding']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { data: profile, isLoading, isError, error, refetch } = useOwnProfile();
  // Her answers by field, read through her organization's fields (RAPP-663).
  const answers = useMemo(
    () => (profile === null || profile === undefined ? null : profileFormOf(profile)),
    [profile],
  );
  // One formatter per language: building an `Intl.DateTimeFormat` per date is
  // the most expensive thing this screen would do.
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE),
    [i18n.resolvedLanguage],
  );

  function formatDate(value: string | null): string {
    if (value === null) return t('notProvided');
    const date = new Date(value);
    // An unparseable stored date says "not provided" rather than throwing.
    if (Number.isNaN(date.getTime())) return t('notProvided');
    return dateFormatter.format(date);
  }

  const shown = (value: string | null | undefined): string =>
    value === null || value === undefined || value === '' ? t('notProvided') : value;

  // `DB-2` when the read SUCCEEDED but held no row: "not found", not a crash.
  const loadFailureCode = isError ? toAppError(error).code : 'DB-2';
  const handleRetry = useCallback(() => void refetch(), [refetch]);
  const handleEdit = useCallback(() => push('/profile-edit' as Href), [push]);

  return (
    <ProfileScreenFrame title={t('menu.data')} testID="profile-data">
      {isLoading ? (
        // One node that says it is LOADING: a screen reader announcing the
        // title over a skeleton is indistinguishable from an empty profile.
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('loading')}
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
          className="gap-lg"
        >
          {Array.from({ length: LOADING_SECTION_COUNT }, (_unused, index) => (
            <View key={index} className="gap-sm">
              <SkeletonPulse className="h-lg w-1/2 rounded-md" />
              <SkeletonPulse className="h-3xl w-full rounded-md" />
            </View>
          ))}
        </View>
      ) : isError || profile === null || profile === undefined || answers === null ? (
        // A failed read says so and offers a retry. It must never render as an
        // empty profile: "we hold nothing about you" is a false statement.
        <ShakeOnError errorCode={loadFailureCode}>
          <View className="gap-md">
            <Text
              selectable
              accessibilityLiveRegion="polite"
              className={`text-start text-md text-error ${languageFontClass}`}
            >
              {t('loadFailed')}
            </Text>
            <AuthSubmitButton label={t('retryAction')} onPress={handleRetry} />
          </View>
        </ShakeOnError>
      ) : (
        <>
          <ProfilePhotoEditor profile={profile} />
          <ProfileSection title={t('sectionIdentity')}>
            <ProfileRow label={t('onboarding:firstNameLabel')} value={profile.first_name} />
            <ProfileRow label={t('onboarding:lastNameLabel')} value={profile.last_name} />
            <ProfileRow
              label={t('onboarding:dateOfBirthLabel')}
              value={formatDate(answers.dateOfBirth || null)}
            />
            <ProfileRow
              label={t('onboarding:placeOfBirthLabel')}
              value={shown(answers.placeOfBirth)}
            />
            <ProfileRow
              label={t('onboarding:nationalityLabel')}
              value={shown(answers.nationality)}
            />
          </ProfileSection>

          <ProfileSection title={t('sectionDocumentation')}>
            <ProfileRow
              label={t('onboarding:documentTypeLabel')}
              value={
                answers.documentType === 'other' && answers.documentName
                  ? answers.documentName
                  : documentTypeLabel(answers.documentType ?? null, t)
              }
            />
            <ProfileRow
              label={t('onboarding:documentNumberLabel')}
              value={shown(answers.documentNumber)}
            />
          </ProfileSection>

          <ProfileSection title={t('sectionContact')}>
            <ProfileRow label={t('fieldPhone')} value={shown(answers.phone)} />
            <ProfileRow label={t('fieldAddress')} value={shown(answers.address)} />
            <ProfileRow label={t('fieldCity')} value={shown(answers.city)} />
            <ProfileRow label={t('fieldPostalCode')} value={shown(answers.postalCode)} />
            <ProfileRow
              label={t('onboarding:clothingSizeLabel')}
              value={shown(answers.clothingSize)}
            />
            <ProfileRow label={t('onboarding:shoeSizeLabel')} value={shown(answers.shoeSize)} />
          </ProfileSection>

          {/* The season registration answers (RAPP-303): hers to see and correct. */}
          <ProfileSection title={t('onboarding:seasonSectionTitle')}>
            <SeasonAnswerRows answers={answers} emptyLabel={t('notProvided')} />
          </ProfileSection>

          <AuthSubmitButton
            testID="profile-open-edit"
            label={t('editAction')}
            onPress={handleEdit}
          />
        </>
      )}
    </ProfileScreenFrame>
  );
}

/**
 * The document type in her language. Mapped explicitly rather than by building
 * a key from the stored value, so an unknown value never reaches the screen.
 */
function documentTypeLabel(documentType: string | null, t: (key: string) => string): string {
  switch (documentType) {
    case 'nie':
      return t('onboarding:documentTypeNie');
    case 'passport':
      return t('onboarding:documentTypePassport');
    case 'other':
      return t('onboarding:documentTypeOther');
    case 'none':
      return t('onboarding:documentTypeNone');
    default:
      return t('notProvided');
  }
}
