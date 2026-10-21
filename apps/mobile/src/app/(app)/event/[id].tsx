import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { EventArticle } from '@/components/events/event-article';
import { PageWidth } from '@/components/layout/content-width';
import { SuccessPop } from '@/components/motion/success-pop';
import { EventSurveyPrompt } from '@/components/surveys/survey-prompt';
import { isEventSignupActionDisabled } from '@/lib/event-signup-policy';
import { playErrorHaptic } from '@/lib/haptics/haptics';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useEventSignup, usePlayerEvents } from '@/lib/player-events';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import * as Linking from 'expo-linking';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import { nextEventSignupState, type EventSignupState } from '@ramassa/shared/events';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

function successKey(state: EventSignupState): string {
  if (state === 'confirmed') return 'playerSignupSuccessConfirmed';
  if (state === 'interested') return 'playerSignupSuccessInterested';
  return 'playerSignupSuccessCancelled';
}

export default function EventDetailScreen() {
  const { id, occurrenceId } = useLocalSearchParams<{ id: string; occurrenceId?: string }>();
  const { t } = useTranslation(['events', 'errors']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const { data, error, isError, isPending, refetch } = usePlayerEvents();
  const {
    data: signupData,
    error: signupMutationError,
    isPending: isSignupPending,
    isSuccess: isSignupSuccess,
    mutate: mutateSignup,
    submittedAt: signupSubmittedAt,
  } = useEventSignup();
  const row =
    data?.find((candidate) => candidate.occurrence_id === occurrenceId) ??
    data?.find((candidate) => candidate.event.id === id);
  const title = row === undefined ? undefined : resolveLocalizedText(row.event.title, language);
  const category =
    row === undefined ? undefined : resolveLocalizedText(row.event.category.name, language);
  const currentState = row?.signup?.state ?? null;
  const nextState =
    row === undefined ? null : nextEventSignupState(row.event.signup_mode, currentState);
  const hasActiveSignup = currentState === 'confirmed' || currentState === 'interested';
  const isFull =
    row?.event.max_participants !== null &&
    row?.event.max_participants !== undefined &&
    row.event.active_signup_count >= row.event.max_participants;
  const actionDisabled = isEventSignupActionDisabled({
    hasEvent: row !== undefined,
    hasNextState: nextState !== null,
    isFull,
    hasActiveSignup,
  });
  const actionLabel = hasActiveSignup
    ? t('playerCancelAction')
    : row?.event.signup_mode === 'interest'
      ? t('playerInterestAction')
      : t('playerConfirmAction');
  const insets = useSafeAreaInsets();
  const androidInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingBottom: insets.bottom + tokens.spacing.lg,
          }
        : undefined,
    [insets.bottom],
  );
  const screenOptions = useMemo(
    () => ({
      headerShown: true,
      headerBackButtonDisplayMode: 'minimal' as const,
      title: title?.text ?? t('playerTitle'),
    }),
    [t, title?.text],
  );
  const signupError = signupMutationError === null ? null : toAppError(signupMutationError);
  const locationUrl = row?.event.location_url;
  const openMap = useCallback(() => {
    if (locationUrl !== null && locationUrl !== undefined) void Linking.openURL(locationUrl);
  }, [locationUrl]);
  const retryEvents = useCallback(() => void refetch(), [refetch]);
  const submitSignup = useCallback(() => {
    if (row !== undefined && nextState !== null) {
      mutateSignup({ eventId: row.event.id, state: nextState });
    }
  }, [mutateSignup, nextState, row]);

  useEffect(() => {
    if (signupError !== null) playErrorHaptic(signupError.code);
  }, [signupError]);

  if (isPending && data === undefined) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <AnnouncementFeedSkeleton accessibilityLabel={t('playerLoading')} />
      </>
    );
  }
  if (isError && data === undefined) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <AnnouncementFeedError
          message={t('playerLoadFailed')}
          retryLabel={t('playerRetryAction')}
          code={toAppError(error).code}
          languageFontClass={languageFontClass}
          onRetry={retryEvents}
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName="grow px-lg py-lg"
        contentContainerStyle={androidInsets}
        contentInsetAdjustmentBehavior="automatic"
      >
        <PageWidth className="gap-lg">
          {isOffline ? (
            <OfflineBanner label={t('playerOfflineBanner')} languageFontClass={languageFontClass} />
          ) : null}

          {row === undefined || title === undefined || category === undefined ? (
            <View className="flex-1 items-center justify-center gap-md py-3xl">
              <Text
                accessibilityRole="header"
                className={`text-center text-xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('playerEmptyTitle')}
              </Text>
              <Text className={`text-center text-md text-neutral-600 ${languageFontClass}`}>
                {t('playerEmptyBody')}
              </Text>
            </View>
          ) : (
            <View className="gap-xl">
              <EventArticle
                event={{
                  title: row.event.title,
                  description: row.event.description,
                  categoryName: row.event.category.name,
                  startsAt: row.occurrence_starts_at,
                  endsAt: row.occurrence_ends_at,
                  location: row.event.location,
                  locationUrl: row.event.location_url,
                  maxParticipants: row.event.max_participants,
                  activeSignupCount: row.event.active_signup_count,
                }}
                onOpenMap={openMap}
              >
                {currentState === 'confirmed' || currentState === 'interested' ? (
                  <Text
                    className={`text-start text-md font-semibold text-success ${languageFontClass}`}
                  >
                    {currentState === 'confirmed' ? t('playerConfirmed') : t('playerInterested')}
                  </Text>
                ) : null}
                {nextState === null ? (
                  <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                    {t('playerSignupClosed')}
                  </Text>
                ) : (
                  <AuthSubmitButton
                    label={actionLabel}
                    disabled={actionDisabled}
                    isLoading={isSignupPending}
                    onPress={submitSignup}
                  />
                )}
                {isOffline && nextState !== null ? (
                  <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                    {t('playerSignupOffline')}
                  </Text>
                ) : null}
                {signupError === null ? null : (
                  <View className="gap-xs" accessibilityRole="alert">
                    <Text
                      selectable
                      className={`text-start text-sm text-error ${languageFontClass}`}
                    >
                      {t(`errors:${signupError.code}`)}
                    </Text>
                  </View>
                )}
                {isSignupSuccess ? (
                  <SuccessPop key={`${signupData.state}:${signupSubmittedAt}`}>
                    <Text
                      accessibilityLiveRegion="polite"
                      className={`text-start text-md font-semibold text-success ${languageFontClass}`}
                    >
                      {t(successKey(signupData.state))}
                    </Text>
                  </SuccessPop>
                ) : null}
              </EventArticle>
              {row.occurrence_ends_at !== null &&
              Date.parse(row.occurrence_ends_at) <= Date.now() ? (
                <EventSurveyPrompt eventId={row.event.id} />
              ) : null}
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </>
  );
}
