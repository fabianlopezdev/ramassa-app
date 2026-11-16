/**
 * One upcoming event as the partner entity reads it (RAPP-805): title,
 * description, date, start and end time where the event happens, the place and
 * its map. Read only: entities never sign up, so no sign-up action shows. Built
 * from the row the Events list already loaded.
 */
import { EntitySheet } from '@/components/entity/entity-sheet';
import { EventDetailLine } from '@/components/events/event-card';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';
import type { EntityUpcomingEvent } from '@ramassa/shared/entity-management';
import {
  DEFAULT_LANGUAGE,
  resolveLocalizedText,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

export function EntityEventSheet({
  event,
  onClose,
}: {
  readonly event: EntityUpcomingEvent | null;
  readonly onClose: () => void;
}) {
  const { t, i18n } = useTranslation('events');
  const { t: tEntity } = useTranslation('entity-management');
  const fontClass = useLanguageFontClass();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  if (event === null) return null;

  const title = resolveLocalizedText(event.title, language)?.text ?? '';
  const description = resolveLocalizedText(event.description, language)?.text ?? '';
  const date = new Intl.DateTimeFormat(language, {
    dateStyle: 'full',
    timeZone: event.timeZone,
  });
  const time = new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: event.timeZone,
  });
  const locationUrl = event.locationUrl;

  return (
    <EntitySheet testID="entity-events-detail" title={title} visible onClose={onClose}>
      {event.isRecurring ? (
        <Text className={`text-start text-sm font-semibold text-primary-dark ${fontClass}`}>
          {tEntity('recurring')}
        </Text>
      ) : null}
      {description.length > 0 ? (
        <Text selectable className={`text-start text-lg text-neutral-700 ${fontClass}`}>
          {description}
        </Text>
      ) : null}
      <View
        accessibilityLabel={t('playerDetails')}
        style={continuousCorners}
        className="gap-md rounded-lg bg-neutral-50 p-lg"
      >
        <EventDetailLine
          label={t('playerDate')}
          value={date.format(new Date(event.startsAt))}
          languageFontClass={fontClass}
        />
        <EventDetailLine
          label={t('playerTime')}
          value={time.format(new Date(event.startsAt))}
          languageFontClass={fontClass}
        />
        {event.endsAt === null ? null : (
          <EventDetailLine
            label={t('playerEnds')}
            value={time.format(new Date(event.endsAt))}
            languageFontClass={fontClass}
          />
        )}
        <EventDetailLine
          label={t('playerLocation')}
          value={event.location}
          languageFontClass={fontClass}
        />
        {locationUrl === null ? null : (
          <PressableScale
            testID="entity-events-detail-map"
            accessibilityRole="link"
            accessibilityLabel={t('playerOpenMap')}
            onPress={() => void Linking.openURL(locationUrl)}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
          >
            <Text className={`text-md font-bold text-primary ${fontClass}`}>
              {t('playerOpenMap')}
            </Text>
          </PressableScale>
        )}
      </View>
    </EntitySheet>
  );
}
