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
import { useOrganizationBranding } from '@/components/branding/organization-branding-provider';
import { ErrorCodeLine } from '@/components/error-code-line';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { AttendanceHistorySection } from '@/components/profile/attendance-history-section';
import { LanguageSwitcher } from '@/components/profile/language-switcher';
import { ProfileRow, ProfileSection } from '@/components/profile/profile-section';
import { logout } from '@/lib/auth';
import { continuousCorners } from '@/lib/continuous-corners';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { useOwnDeletionRequest, useOwnProfile } from '@ramassa/shared/profile';

// The dev-menu entry, required inside a __DEV__ branch so neither the component
// nor its label reaches a production bundle (RAPP-19). The SPEC puts the menu on
// this tab, and now that the tab has real content it lives at the bottom.
const DevMenuEntry = __DEV__
  ? (require('@/components/dev/dev-menu-entry') as typeof import('@/components/dev/dev-menu-entry'))
      .DevMenuEntry
  : null;

/**
 * How many section placeholders the loading state draws, one per real section
 * below. A skeleton, not a spinner (SPEC / contract rule 14): it holds the
 * shape of the answer so the content does not jump in over a spinner.
 */
const LOADING_SECTION_COUNT = 4;

export default function ProfileScreen() {
  const { t, i18n } = useTranslation(['profile', 'onboarding', 'feedback', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { data: profile, isLoading, isError, error, refetch } = useOwnProfile();
  const { data: deletionRequest } = useOwnDeletionRequest();
  const { session } = useAuth();
  const organization = useOrganizationBranding();
  const organizationLogo = resolveMediaImageSource({
    objectKeyOrUrl: organization?.logo_url ?? null,
    mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
    accessToken: session?.access_token,
  });

  /**
   * ONE formatter per language, not one per date. `toLocaleDateString` builds a
   * fresh `Intl.DateTimeFormat` on every call, and instantiating one parses
   * locale data and builds lookup tables: by far the most expensive thing on
   * this screen per call, and this screen formats several dates. Same output as
   * before (a bare `Intl.DateTimeFormat(locale)` IS what `toLocaleDateString`
   * constructs), so no locale reads differently.
   */
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE),
    [i18n.resolvedLanguage],
  );

  function formatDate(value: string | null): string {
    if (value === null) return t('notProvided');
    const date = new Date(value);
    // An unparseable stored date says "not provided" rather than throwing:
    // `format` rejects an Invalid Date where `toLocaleDateString` used to
    // return the literal string "Invalid Date", and neither belongs on a screen
    // whose whole job is telling a woman what is held about her.
    if (Number.isNaN(date.getTime())) return t('notProvided');
    return dateFormatter.format(date);
  }

  const shown = (value: string | null | undefined): string =>
    value === null || value === undefined || value === '' ? t('notProvided') : value;

  // `DB-2` when the read SUCCEEDED but held no row: that is "not found", not a
  // crash, and the taxonomy keeps the two apart. Named once here because it is
  // now used twice: it drives the shake's haptic and it is the code she reports.
  const loadFailureCode = isError ? toAppError(error).code : 'DB-2';

  // Android's share of the insets, and only Android's: on iOS
  // `contentInsetAdjustmentBehavior="automatic"` already accounts for both the
  // status bar and the floating tab bar, so adding padding there would double
  // it. A computed value rather than a module constant because it depends on
  // the device, but still one object per inset change rather than per render.
  const insets = useSafeAreaInsets();
  const androidEdgeInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? { paddingTop: insets.top, paddingBottom: insets.bottom }
        : undefined,
    [insets.top, insets.bottom],
  );
  const handleRetry = useCallback(() => void refetch(), [refetch]);
  const handleEdit = useCallback(() => push('/profile-edit'), [push]);
  const handleDelete = useCallback(() => push('/profile-delete-data'), [push]);
  const handleFeedback = useCallback(() => push('/feedback' as Href), [push]);
  const handleLogout = useCallback(() => void logout(), []);

  return (
    // A ScrollView with automatic inset adjustment, not a plain View. The iOS 26
    // native tab bar is a floating pill drawn OVER the screen, so anything laid
    // out at the bottom of a tab screen sits underneath it: unreachable, and
    // absent from the accessibility tree entirely.
    //
    // `contentInsetAdjustmentBehavior` is iOS-ONLY, so on Android it did
    // nothing at all and this screen had no insets in either direction: under
    // edge-to-edge the heading drew beneath the status bar, and the last row of
    // the last section sat under the navigation bar. The safe-area padding
    // below is what Android gets instead; it is zero on iOS, where the prop
    // above has already done the work, so the two cannot double up.
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="grow gap-lg p-lg"
      contentContainerStyle={androidEdgeInsets}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View className="gap-xs">
        {organizationLogo === null ? null : (
          <Image
            source={organizationLogo}
            accessibilityLabel={organization?.name ?? t('common:appName')}
            contentFit="contain"
            className="mb-sm h-16 w-40 self-start"
          />
        )}
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
        // One node that says it is LOADING, not one that repeats the screen
        // title: a screen reader announcing "My profile" over a skeleton is
        // indistinguishable from a profile that came back empty, and busy is
        // the state that tells the listener to wait rather than to act.
        <View
          accessible
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
      ) : isError || profile === null || profile === undefined ? (
        // A failed read says so and offers a retry. It must never render as an
        // empty profile: "we hold nothing about you" is a different statement,
        // and a false one.
        <ShakeOnError errorCode={loadFailureCode}>
          <View className="gap-md">
            <Text
              selectable
              accessibilityLiveRegion="polite"
              className={`text-start text-md text-error ${languageFontClass}`}
            >
              {t('loadFailed')}
            </Text>
            {/* Translated message AND the short code (contract rule 7): the
                retry button is the answer when it is a dead connection, and
                the code is what tells staff when it is not. */}
            <ErrorCodeLine code={loadFailureCode} />
            <AuthSubmitButton label={t('retryAction')} onPress={handleRetry} />
          </View>
        </ShakeOnError>
      ) : (
        <>
          {/* The record assembles section by section instead of arriving as a
              slab (contract rule 14). Mount-only and stagger-capped by the
              primitive, and completely flat under reduce-motion. */}
          <FadeSlideIn index={0}>
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
          </FadeSlideIn>

          <FadeSlideIn index={1}>
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
          </FadeSlideIn>

          <FadeSlideIn index={2}>
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
          </FadeSlideIn>

          <FadeSlideIn index={3}>
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
          </FadeSlideIn>

          <FadeSlideIn index={4}>
            <AttendanceHistorySection />
          </FadeSlideIn>

          <AuthSubmitButton label={t('editAction')} onPress={handleEdit} />
        </>
      )}

      <ProfileSection title={t('sectionApp')}>
        <LanguageSwitcher />
        <PressableScale
          testID="profile-open-feedback"
          accessibilityLabel={t('feedback:profileAction')}
          onPress={handleFeedback}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended justify-center rounded-md border border-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-primary ${languageFontClass}`}>
            {t('feedback:profileAction')}
          </Text>
        </PressableScale>
        <Text
          testID="generalitat-credit"
          className={`text-start text-xs leading-body text-neutral-600 ${languageFontClass}`}
        >
          {t('common:fundingAcknowledgment')}
        </Text>
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
            <Text
              selectable
              className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}
            >
              {t('deletePendingBody', { date: formatDate(deletionRequest.created_at) })}
            </Text>
          </View>
        ) : (
          <PressableScale
            accessibilityLabel={t('deleteTitle')}
            onPress={handleDelete}
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
        testID="profile-sign-out"
        accessibilityLabel={t('signOutAction')}
        onPress={handleLogout}
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
