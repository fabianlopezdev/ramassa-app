import { OfflineBanner } from '@/components/announcements/feed-states';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { ErrorCodeLine } from '@/components/error-code-line';
import { EventDetailLine } from '@/components/events/event-card';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SuccessPop } from '@/components/motion/success-pop';
import { composeContinuousViewStyle, continuousCorners } from '@/lib/continuous-corners';
import { isEventSignupActionDisabled } from '@/lib/event-signup-policy';
import { playErrorHaptic } from '@/lib/haptics/haptics';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useEventSignup, usePlayerEvents } from '@/lib/player-events';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import * as Linking from 'expo-linking';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import { nextEventSignupState, type EventSignupState } from '@ramassa/shared/events';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  backButton: {
    minHeight: tokens.tapTarget.recommended,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.neutral[300],
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.lg,
  },
  mapButton: {
    minHeight: tokens.tapTarget.recommended,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.primary.DEFAULT,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
  },
});
const mapButtonStyle = composeContinuousViewStyle(styles.mapButton);

function successKey(state: EventSignupState): string {
  if (state === 'confirmed') return 'playerSignupSuccessConfirmed';
  if (state === 'interested') return 'playerSignupSuccessInterested';
  return 'playerSignupSuccessCancelled';
}

export default function EventDetailScreen() {
  const { id, occurrenceId } = useLocalSearchParams<{ id: string; occurrenceId?: string }>();
  const { back } = useRouter();
  const { t, i18n } = useTranslation(['events', 'errors']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const { data } = usePlayerEvents();
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
  const description =
    row?.event.description === null || row?.event.description === undefined
      ? undefined
      : resolveLocalizedText(row.event.description, language);
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
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'full',
        timeZone: 'Europe/Madrid',
      }),
    [i18n.resolvedLanguage],
  );
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Madrid',
      }),
    [i18n.resolvedLanguage],
  );
  const insets = useSafeAreaInsets();
  const androidInsets = useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: insets.top + tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing.lg,
          }
        : undefined,
    [insets.bottom, insets.top],
  );
  const signupError = signupMutationError === null ? null : toAppError(signupMutationError);
  const locationUrl = row?.event.location_url;
  const openMap = useCallback(() => {
    if (locationUrl !== null && locationUrl !== undefined) void Linking.openURL(locationUrl);
  }, [locationUrl]);
  const submitSignup = useCallback(() => {
    if (row !== undefined && nextState !== null) {
      mutateSignup({ eventId: row.event.id, state: nextState });
    }
  }, [mutateSignup, nextState, row]);

  useEffect(() => {
    if (signupError !== null) playErrorHaptic(signupError.code);
  }, [signupError]);

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="grow px-lg py-lg"
      contentContainerStyle={androidInsets}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PageWidth className="gap-lg">
        <PressableScale
          accessibilityLabel={t('playerBack')}
          onPress={back}
          haptic="tapLight"
          style={styles.backButton}
          className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
        >
          <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
            {t('playerBack')}
          </Text>
        </PressableScale>

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
            <View className="gap-md">
              <View className="self-start rounded-full bg-neutral-100 px-sm py-xs">
                <Text className={`text-sm font-medium text-neutral-700 ${languageFontClass}`}>
                  {category.text}
                </Text>
              </View>
              <Text
                accessibilityRole="header"
                className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {title.text}
              </Text>
              {description === undefined ? null : (
                <Text className={`text-start text-lg text-neutral-700 ${languageFontClass}`}>
                  {description.text}
                </Text>
              )}
            </View>

            <View
              accessibilityLabel={t('playerDetails')}
              className="gap-md rounded-lg bg-neutral-50 p-lg"
              style={continuousCorners}
            >
              <EventDetailLine
                label={t('playerDate')}
                value={dateFormatter.format(new Date(row.occurrence_starts_at))}
                languageFontClass={languageFontClass}
              />
              <EventDetailLine
                label={t('playerTime')}
                value={timeFormatter.format(new Date(row.occurrence_starts_at))}
                languageFontClass={languageFontClass}
              />
              {row.occurrence_ends_at === null ? null : (
                <EventDetailLine
                  label={t('playerEnds')}
                  value={timeFormatter.format(new Date(row.occurrence_ends_at))}
                  languageFontClass={languageFontClass}
                />
              )}
              <EventDetailLine
                label={t('playerLocation')}
                value={row.event.location}
                languageFontClass={languageFontClass}
              />
              {row.event.location_url === null ? null : (
                <PressableScale
                  accessibilityRole="link"
                  accessibilityLabel={t('playerOpenMap')}
                  onPress={openMap}
                  haptic="tapLight"
                  style={mapButtonStyle}
                  className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
                >
                  <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                    {t('playerOpenMap')}
                  </Text>
                </PressableScale>
              )}
            </View>

            <View
              className="gap-md rounded-lg border border-neutral-200 p-lg"
              style={continuousCorners}
            >
              <Text
                accessibilityRole="header"
                className={`text-start text-lg font-bold tabular-nums text-neutral-900 ${languageFontClass}`}
              >
                {row.event.max_participants === null
                  ? t('playerUnlimited')
                  : isFull
                    ? t('playerFull')
                    : t('playerPlaces', {
                        remaining: row.event.max_participants - row.event.active_signup_count,
                        total: row.event.max_participants,
                      })}
              </Text>
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
                  <Text selectable className={`text-start text-sm text-error ${languageFontClass}`}>
                    {t(`errors:${signupError.code}`)}
                  </Text>
                  <ErrorCodeLine code={signupError.code} />
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
            </View>
          </View>
        )}
      </PageWidth>
    </ScrollView>
  );
}
