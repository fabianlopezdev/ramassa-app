import { RaisedCard, type RaisedCardBadge } from '@/components/layout/raised-card';
import type { TFunction } from 'i18next';
import { memo, useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import {
  eventCategoryPaletteColor,
  MADRID_TIME_ZONE,
  type EventSignupState,
  type PlayerEventOccurrence,
} from '@ramassa/shared/events';
import { sectionHue } from '@ramassa/shared/section-colors';

/**
 * The shade of an activity category's stored colour (RAPP-893), from the
 * shared section palette: `primary` is the organization's own colour, passed
 * as `brandColor`, and an older name shows the palette colour it moves to.
 */
export function eventCategoryColor(color: string, brandColor: string): string {
  return sectionHue(eventCategoryPaletteColor(color), brandColor) ?? brandColor;
}

/**
 * Her answer chip on an activity card, yes or no (RAPP-908), and nothing
 * before she answers; `t` resolves the `events` namespace.
 */
export function playerEventSignupLabel(
  state: EventSignupState | undefined,
  t: TFunction,
): string | null {
  if (state === 'confirmed') return t('events:playerConfirmed');
  if (state === 'interested') return t('events:playerInterested');
  if (state === 'cancelled') return t('events:playerDeclined');
  return null;
}

/** The places line on an activity card; `t` resolves the `events` namespace. */
export function playerEventCapacityLabel(row: PlayerEventOccurrence, t: TFunction): string {
  const maximum = row.event.max_participants;
  if (maximum === null) return t('events:playerUnlimited');
  const remaining = Math.max(0, maximum - row.event.active_signup_count);
  return remaining === 0
    ? t('events:playerFull')
    : t('events:playerPlaces', { remaining, total: maximum });
}

export function EventDetailLine({
  label,
  value,
  languageFontClass,
}: {
  readonly label: string;
  readonly value: string;
  readonly languageFontClass: string;
}) {
  return (
    <View className="gap-xs">
      <Text className={`text-start text-sm font-semibold text-neutral-500 ${languageFontClass}`}>
        {label}
      </Text>
      <Text
        selectable
        className={`text-start text-md tabular-nums text-neutral-900 ${languageFontClass}`}
      >
        {value}
      </Text>
    </View>
  );
}

interface EventCardDateParts {
  readonly day: string;
  readonly month: string;
  readonly time: string;
}

const datePartFormatters = new Map<string, readonly Intl.DateTimeFormat[]>();

/** The day, short month and time of an activity, in Madrid time, for the card's date block. */
function eventCardDateParts(startsAt: string, locale: string): EventCardDateParts {
  let formatters = datePartFormatters.get(locale);
  if (formatters === undefined) {
    formatters = [
      new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: MADRID_TIME_ZONE }),
      new Intl.DateTimeFormat(locale, { month: 'short', timeZone: MADRID_TIME_ZONE }),
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: MADRID_TIME_ZONE,
      }),
    ];
    datePartFormatters.set(locale, formatters);
  }
  const date = new Date(startsAt);
  const [day, month, time] = formatters.map((formatter) => formatter.format(date));
  return { day: day ?? '', month: month ?? '', time: time ?? '' };
}

export interface EventCardProps {
  readonly eventId: string;
  readonly occurrenceId: string;
  readonly title: string;
  /** When this occurrence starts; the card shows its day, month and time. */
  readonly startsAt: string;
  readonly locale: string;
  readonly location: string;
  readonly signupLabel: string | null;
  /** Set while the activity is new to her (RAPP-821): the word shown on its mark. */
  readonly unseenLabel?: string | null;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly onOpen: (eventId: string, occurrenceId: string) => void;
}

/**
 * An activity as a raised card (RAPP-828): its day and month in a block at the
 * start, then its name, time, place and her sign-up. The same card on Inici
 * and in the Activitats list.
 */
export const EventCard = memo(function EventCard({
  eventId,
  occurrenceId,
  title,
  startsAt,
  locale,
  location,
  signupLabel,
  unseenLabel = null,
  accessibilityLabel,
  languageFontClass,
  onOpen,
}: EventCardProps) {
  const handleOpen = useCallback(
    () => onOpen(eventId, occurrenceId),
    [eventId, occurrenceId, onOpen],
  );
  const { day, month, time } = eventCardDateParts(startsAt, locale);
  // One badge on the card's edge: her answer once she gives one, else "Nou" while it is new to her.
  const badge = useMemo<RaisedCardBadge | null>(() => {
    if (signupLabel !== null) return { label: signupLabel, tone: 'accent' };
    return unseenLabel === null ? null : { label: unseenLabel, tone: 'brand' };
  }, [signupLabel, unseenLabel]);

  return (
    <RaisedCard
      testID={`event-card-${eventId}-${occurrenceId}`}
      accessibilityLabel={accessibilityLabel}
      onOpen={handleOpen}
      showsArrow={false}
      badge={badge}
      leading={
        <>
          <Text
            className={`text-4xl font-extrabold tabular-nums text-neutral-900 ${languageFontClass}`}
          >
            {day}
          </Text>
          <Text className={`text-md font-bold uppercase text-primary-dark ${languageFontClass}`}>
            {month}
          </Text>
        </>
      }
    >
      <Text
        className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
        numberOfLines={2}
      >
        {title}
      </Text>
      <Text
        className={`text-start text-lg font-bold tabular-nums text-primary-dark ${languageFontClass}`}
      >
        {time}
      </Text>
      <Text
        className={`text-start text-md text-neutral-700 ${languageFontClass}`}
        numberOfLines={2}
      >
        {location}
      </Text>
    </RaisedCard>
  );
});
