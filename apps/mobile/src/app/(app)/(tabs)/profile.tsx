/**
 * The profile tab (RAPP-22): what Ramassà holds about this participant, in her
 * language, with the controls to change it.
 *
 * This is also the RGPD self-service surface. Two of the rights a participant
 * has are exercised here directly (see your data, correct it), the third starts
 * here (ask for erasure), and the fourth (withdraw the media consent) is a chip
 * on the edit screen. The wizard's terms step promised she could change that
 * "whenever you want, from your profile"; this is where that promise lands.
 */

import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { PressableScale } from '@/components/motion/pressable-scale';
import { LanguageSwitcher } from '@/components/profile/language-switcher';
import { ProfileRow, ProfileSection } from '@/components/profile/profile-section';
import { logout } from '@/lib/auth';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useOwnDeletionRequest, useOwnProfile } from '@ramassa/shared/profile';

// The dev-menu entry, required inside a __DEV__ branch so neither the component
// nor its label reaches a production bundle (RAPP-19). The SPEC puts the menu on
// this tab, and now that the tab has real content it lives at the bottom.
const DevMenuEntry = __DEV__
  ? (require('@/components/dev/dev-menu-entry') as typeof import('@/components/dev/dev-menu-entry'))
      .DevMenuEntry
  : null;

export default function ProfileScreen() {
  const { t, i18n } = useTranslation(['profile', 'onboarding']);
  const languageFontClass = useLanguageFontClass();
  const router = useRouter();
  const { data: profile, isLoading, isError, refetch } = useOwnProfile();
  const { data: deletionRequest } = useOwnDeletionRequest();

  function formatDate(value: string | null): string {
    if (value === null) return t('notProvided');
    return new Date(value).toLocaleDateString(i18n.resolvedLanguage ?? 'ca');
  }

  const shown = (value: string | null | undefined): string =>
    value === null || value === undefined || value === '' ? t('notProvided') : value;

  return (
    // A ScrollView with automatic inset adjustment, not a plain View. The iOS 26
    // native tab bar is a floating pill drawn OVER the screen, so anything laid
    // out at the bottom of a tab screen sits underneath it: unreachable, and
    // absent from the accessibility tree entirely.
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="grow gap-lg p-lg"
      contentInsetAdjustmentBehavior="automatic"
    >
      <View className="gap-xs">
        <Text
          accessibilityRole="header"
          className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
        >
          {t('title')}
        </Text>
        <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
          {t('intro')}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator accessibilityLabel={t('title')} />
      ) : isError || profile === null || profile === undefined ? (
        // A failed read says so and offers a retry. It must never render as an
        // empty profile: "we hold nothing about you" is a different statement,
        // and a false one.
        <View className="gap-md">
          <Text
            accessibilityLiveRegion="polite"
            className={`text-start text-md text-error ${languageFontClass}`}
          >
            {t('loadFailed')}
          </Text>
          <AuthSubmitButton label={t('retryAction')} onPress={() => void refetch()} />
        </View>
      ) : (
        <>
          <ProfileSection title={t('sectionIdentity')}>
            <ProfileRow label={t('onboarding:firstNameLabel')} value={profile.first_name} />
            <ProfileRow label={t('onboarding:lastNameLabel')} value={profile.last_name} />
            <ProfileRow
              label={t('onboarding:dateOfBirthLabel')}
              value={formatDate(profile.date_of_birth)}
            />
            <ProfileRow
              label={t('onboarding:placeOfBirthLabel')}
              value={shown(profile.place_of_birth)}
            />
            <ProfileRow
              label={t('onboarding:nationalityLabel')}
              value={shown(profile.nationality)}
            />
          </ProfileSection>

          <ProfileSection title={t('sectionDocumentation')}>
            <ProfileRow
              label={t('onboarding:documentTypeLabel')}
              value={documentTypeLabel(profile.document_type, t)}
            />
            <ProfileRow
              label={t('onboarding:documentNumberLabel')}
              value={shown(profile.document_number)}
            />
          </ProfileSection>

          <ProfileSection title={t('sectionContact')}>
            {/* Read-view labels, not the form's: "(optional)" is an
                instruction for someone filling a field in, and reads as noise
                next to an answer she already gave. */}
            <ProfileRow label={t('fieldPhone')} value={shown(profile.phone)} />
            <ProfileRow label={t('fieldAddress')} value={shown(profile.address)} />
            <ProfileRow label={t('fieldCity')} value={shown(profile.city)} />
            <ProfileRow label={t('fieldPostalCode')} value={shown(profile.postal_code)} />
            <ProfileRow
              label={t('onboarding:clothingSizeLabel')}
              value={shown(profile.clothing_size)}
            />
            <ProfileRow label={t('onboarding:shoeSizeLabel')} value={shown(profile.shoe_size)} />
          </ProfileSection>

          <ProfileSection title={t('sectionConsents')}>
            <ProfileRow
              label={t('onboarding:termsTitle')}
              value={
                profile.terms_accepted_at === null
                  ? t('notProvided')
                  : t('termsAcceptedOn', { date: formatDate(profile.terms_accepted_at) })
              }
            />
            <ProfileRow
              label={t('fieldMediaConsent')}
              value={profile.media_consent ? t('mediaConsentGranted') : t('mediaConsentDenied')}
            />
          </ProfileSection>

          <AuthSubmitButton label={t('editAction')} onPress={() => router.push('/profile-edit')} />
        </>
      )}

      <ProfileSection title={t('sectionApp')}>
        <LanguageSwitcher />
      </ProfileSection>

      <ProfileSection title={t('sectionData')}>
        {deletionRequest?.state === 'open' ? (
          // Already asked: say so rather than offering the button again. Filing
          // twice does not make it happen sooner, and a form that answers
          // nothing reads as "nobody received it".
          <View className="gap-xs">
            <Text
              className={`text-start text-md font-medium text-neutral-900 ${languageFontClass}`}
            >
              {t('deletePendingTitle')}
            </Text>
            <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
              {t('deletePendingBody', { date: formatDate(deletionRequest.created_at) })}
            </Text>
          </View>
        ) : (
          <PressableScale
            accessibilityLabel={t('deleteTitle')}
            onPress={() => router.push('/profile-delete-data')}
            haptic="selection"
            style={continuousCorners}
            className="min-h-recommended justify-center rounded-md border border-neutral-300 px-lg"
          >
            <Text className={`text-center text-md font-medium text-error ${languageFontClass}`}>
              {t('deleteTitle')}
            </Text>
          </PressableScale>
        )}
      </ProfileSection>

      <PressableScale
        accessibilityLabel={t('signOutAction')}
        onPress={() => void logout()}
        haptic="tapLight"
        className="min-h-recommended justify-center"
      >
        <Text className={`text-center text-md font-medium text-primary ${languageFontClass}`}>
          {t('signOutAction')}
        </Text>
      </PressableScale>

      {DevMenuEntry === null ? null : <DevMenuEntry />}
    </ScrollView>
  );
}

/**
 * The document type in her language. Mapped explicitly rather than by building
 * a key from the stored value: a value that ever stopped matching a key would
 * render the raw database string on screen instead of failing loudly.
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
