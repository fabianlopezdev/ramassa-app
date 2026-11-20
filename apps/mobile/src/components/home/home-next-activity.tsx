/**
 * Propera activitat on Inici (RAPP-790): the Activitats card for her next
 * activity, opening the same activity detail. No upcoming activity: the card
 * is not rendered.
 */

import {
  EventCard,
  playerEventCapacityLabel,
  playerEventSignupLabel,
} from '@/components/events/event-card';
import { ScreenSection } from '@/components/layout/screen-section';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MADRID_TIME_ZONE, type PlayerEventOccurrence } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE, resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';

interface HomeNextActivityProps {
  readonly occurrence: PlayerEventOccurrence | null;
  /** New to her: not opened and not answered yet (RAPP-821). */
  readonly isUnseen: boolean;
  readonly languageFontClass: string;
}

export function HomeNextActivity({
  occurrence,
  isUnseen,
  languageFontClass,
}: HomeNextActivityProps) {
  const { t, i18n } = useTranslation(['home', 'events']);
  const { language } = useLanguage();
  const { push } = useRouter();
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: MADRID_TIME_ZONE }),
    [locale],
  );
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: MADRID_TIME_ZONE,
      }),
    [locale],
  );
  const openOccurrence = useCallback(
    (eventId: string, occurrenceId: string) => {
      push({
        pathname: '/event/[id]',
        params: { id: eventId, occurrenceId },
      } as unknown as Href);
    },
    [push],
  );

  if (occurrence === null) return null;
  const title = resolveLocalizedText(occurrence.event.title, language);
  const categoryName = resolveLocalizedText(occurrence.event.category.name, language);
  if (title === undefined || categoryName === undefined) return null;

  const startsAt = new Date(occurrence.occurrence_starts_at);
  const date = dateFormatter.format(startsAt);
  const time = timeFormatter.format(startsAt);
  const capacity = playerEventCapacityLabel(occurrence, t);
  const signup = playerEventSignupLabel(occurrence.signup?.state, t);
  const unseenLabel = isUnseen ? t('home:unseen') : null;

  return (
    <ScreenSection testID="home-next-activity" title={t('nextActivity.title')}>
      <EventCard
        eventId={occurrence.event.id}
        occurrenceId={occurrence.occurrence_id}
        title={title.text}
        startsAt={occurrence.occurrence_starts_at}
        locale={locale}
        location={occurrence.event.location}
        signupLabel={signup}
        unseenLabel={unseenLabel}
        accessibilityLabel={[
          unseenLabel,
          t('events:playerOpenEvent', { title: title.text }),
          categoryName.text,
          date,
          time,
          occurrence.event.location,
          capacity,
          signup,
        ]
          .filter((value): value is string => typeof value === 'string')
          .join('. ')}
        languageFontClass={languageFontClass}
        onOpen={openOccurrence}
      />
    </ScreenSection>
  );
}
