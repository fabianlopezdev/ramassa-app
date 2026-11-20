/**
 * Privacitat i permisos (RAPP-794): her consents, the terms she accepted, and
 * the way to ask for her data to be erased. The only place she changes the
 * photo and video consent.
 */
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { MyConsentsSection } from '@/components/profile/my-consents-section';
import { ProfileScreenFrame } from '@/components/profile/profile-screen-frame';
import { ProfileRow, ProfileSection } from '@/components/profile/profile-section';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { useOwnDeletionRequest, useOwnProfile } from '@ramassa/shared/profile';

export default function ProfilePrivacyScreen() {
  const { t, i18n } = useTranslation(['profile', 'onboarding']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { data: profile, isLoading, isError, error, refetch } = useOwnProfile();
  const { data: deletionRequest } = useOwnDeletionRequest();
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE),
    [i18n.resolvedLanguage],
  );
  const formatDate = useCallback(
    (value: string) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? t('notProvided') : dateFormatter.format(date);
    },
    [dateFormatter, t],
  );
  const handleRetry = useCallback(() => void refetch(), [refetch]);
  const handleDelete = useCallback(() => push('/profile-delete-data' as Href), [push]);
  const loadFailureCode = isError ? toAppError(error).code : 'DB-2';

  return (
    <ProfileScreenFrame title={t('menu.privacy')} testID="profile-privacy">
      {isLoading ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('loading')}
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
          className="gap-sm"
        >
          <SkeletonPulse className="h-lg w-1/2 rounded-md" />
          <SkeletonPulse className="h-3xl w-full rounded-md" />
        </View>
      ) : isError || profile === null || profile === undefined ? (
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
          <MyConsentsSection profile={profile} />
          <ProfileSection title={t('sectionConsents')}>
            <ProfileRow
              label={t('onboarding:termsTitle')}
              value={
                profile.terms_accepted_at === null
                  ? t('notProvided')
                  : t('termsAcceptedOn', { date: formatDate(profile.terms_accepted_at) })
              }
            />
          </ProfileSection>
        </>
      )}

      {/* Open: its only content is the call to ask for erasure, a red button
          as wide as the page (RAPP-898). */}
      <ProfileSection title={t('sectionData')} isOpen>
        {deletionRequest?.state === 'open' ? (
          // Already asked: say so rather than offering the button again.
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
          <RaisedActionButton
            testID="profile-open-delete-data"
            label={t('deleteTitle')}
            tone="danger"
            onPress={handleDelete}
          />
        )}
      </ProfileSection>
    </ProfileScreenFrame>
  );
}
