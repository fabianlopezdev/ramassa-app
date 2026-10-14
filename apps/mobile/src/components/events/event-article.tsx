/**
 * One event as a player sees it: category, title, description, date, time,
 * place and the places left, in the reader's language. The player screen
 * passes its sign-up controls in as `children`. The team's editor draws its
 * unsaved draft with it (RAPP-373), so the preview is the player's own layout.
 */
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { EventDetailLine } from '@/components/events/event-card';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  MADRID_TIME_ZONE,
  nextEventSignupState,
  type EventSignupMode,
} from '@ramassa/shared/events';
import {
  DEFAULT_LANGUAGE,
  resolveLocalizedText,
  useLanguage,
  type LocalizedContent,
} from '@ramassa/shared/i18n';

export interface EventArticleContent {
  readonly title: LocalizedContent;
  readonly description: LocalizedContent | null;
  readonly categoryName: LocalizedContent;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly location: string;
  readonly locationUrl: string | null;
  readonly maxParticipants: number | null;
  readonly activeSignupCount: number;
}

export function EventArticle({
  event,
  onOpenMap,
  children,
}: {
  readonly event: EventArticleContent;
  readonly onOpenMap: () => void;
  /** The sign-up state and action under the places left. */
  readonly children: ReactNode;
}) {
  const { t, i18n } = useTranslation('events');
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const title = resolveLocalizedText(event.title, language);
  const description =
    event.description === null ? undefined : resolveLocalizedText(event.description, language);
  const category = resolveLocalizedText(event.categoryName, language);
  const isFull = event.maxParticipants !== null && event.activeSignupCount >= event.maxParticipants;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'full',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );

  return (
    <View className="gap-xl">
      <View className="gap-md">
        <View className="self-start rounded-full bg-neutral-100 px-sm py-xs">
          <Text className={`text-sm font-medium text-neutral-700 ${languageFontClass}`}>
            {category?.text ?? ''}
          </Text>
        </View>
        <Text
          accessibilityRole="header"
          className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
        >
          {title?.text ?? ''}
        </Text>
        {description === undefined ? null : (
          <Text selectable className={`text-start text-lg text-neutral-700 ${languageFontClass}`}>
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
          value={dateFormatter.format(new Date(event.startsAt))}
          languageFontClass={languageFontClass}
        />
        <EventDetailLine
          label={t('playerTime')}
          value={timeFormatter.format(new Date(event.startsAt))}
          languageFontClass={languageFontClass}
        />
        {event.endsAt === null ? null : (
          <EventDetailLine
            label={t('playerEnds')}
            value={timeFormatter.format(new Date(event.endsAt))}
            languageFontClass={languageFontClass}
          />
        )}
        <EventDetailLine
          label={t('playerLocation')}
          value={event.location}
          languageFontClass={languageFontClass}
        />
        {event.locationUrl === null ? null : (
          <PressableScale
            accessibilityRole="link"
            accessibilityLabel={t('playerOpenMap')}
            onPress={onOpenMap}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
          >
            <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
              {t('playerOpenMap')}
            </Text>
          </PressableScale>
        )}
      </View>

      <View className="gap-md rounded-lg border border-neutral-200 p-lg" style={continuousCorners}>
        <Text
          accessibilityRole="header"
          className={`text-start text-lg font-bold tabular-nums text-neutral-900 ${languageFontClass}`}
        >
          {event.maxParticipants === null
            ? t('playerUnlimited')
            : isFull
              ? t('playerFull')
              : t('playerPlaces', {
                  remaining: event.maxParticipants - event.activeSignupCount,
                  total: event.maxParticipants,
                })}
        </Text>
        {children}
      </View>
    </View>
  );
}

/**
 * The sign-up area of a draft's preview (RAPP-373): the action a player will
 * see, which does nothing here.
 */
export function EventSignupPreview({ signupMode }: { readonly signupMode: EventSignupMode }) {
  const { t } = useTranslation('events');
  const languageFontClass = useLanguageFontClass();
  if (nextEventSignupState(signupMode, null) === null) {
    return (
      <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
        {t('playerSignupClosed')}
      </Text>
    );
  }
  return (
    <AuthSubmitButton
      label={signupMode === 'interest' ? t('playerInterestAction') : t('playerConfirmAction')}
      disabled
      isLoading={false}
      onPress={() => undefined}
    />
  );
}
