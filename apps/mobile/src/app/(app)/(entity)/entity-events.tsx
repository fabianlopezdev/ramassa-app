/**
 * The partner entity's Events tab on the phone (RAPP-412), as the web portal's
 * events page: the published upcoming events, read only, with the title and
 * description in her language, the date and time where the event happens,
 * the place and a recurring mark. A card opens the event read only
 * (RAPP-805), from the row this list already loaded.
 */
import { EntityEventSheet } from '@/components/entity/entity-event-sheet';
import { EntityLoadFailure, hasLoadFailed } from '@/components/entity/entity-load-failure';
import { EntityScreenHeader } from '@/components/entity/entity-screen-header';
import { PageWidth } from '@/components/layout/content-width';
import { RaisedCard } from '@/components/layout/raised-card';
import { screenContentClassName } from '@/components/layout/screen-spacing';
import { withScreenEntrance } from '@/components/motion/screen-entrance';
import { useEntityUpcomingEvents } from '@/lib/entity-portal';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DEFAULT_LANGUAGE,
  resolveLocalizedText,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

function EntityEventsScreen() {
  const { t, i18n } = useTranslation('entity-management');
  const fontClass = useLanguageFontClass();
  const events = useEntityUpcomingEvents();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const rows = events.data ?? [];
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const openEvent = rows.find((event) => event.id === openEventId) ?? null;

  return (
    <SafeAreaView
      testID="entity-events"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className={screenContentClassName}>
          <EntityScreenHeader title={t('eventsTitle')} intro={t('eventsIntro')} />
          {hasLoadFailed(events) ? (
            <EntityLoadFailure query={events} />
          ) : events.data !== undefined && rows.length === 0 ? (
            <Text
              testID="entity-events-empty"
              className={`text-start text-md text-neutral-600 ${fontClass}`}
            >
              {t('eventsEmpty')}
            </Text>
          ) : (
            <View className="gap-sm">
              {rows.map((event) => {
                const title = resolveLocalizedText(event.title, language)?.text ?? '';
                const description = resolveLocalizedText(event.description, language)?.text ?? '';
                const when = new Intl.DateTimeFormat(language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: event.timeZone,
                }).format(new Date(event.startsAt));
                return (
                  <RaisedCard
                    key={event.id}
                    testID={`entity-event-${event.id}`}
                    accessibilityLabel={`${title}, ${when}`}
                    onOpen={() => setOpenEventId(event.id)}
                  >
                    <Text className={`text-start text-md font-bold text-neutral-900 ${fontClass}`}>
                      {title}
                    </Text>
                    <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
                      {`${when} · ${event.location}`}
                    </Text>
                    {event.isRecurring ? (
                      <Text
                        testID={`entity-event-recurring-${event.id}`}
                        className={`text-start text-sm font-semibold text-primary-dark ${fontClass}`}
                      >
                        {t('recurring')}
                      </Text>
                    ) : null}
                    {description.length > 0 ? (
                      <Text
                        numberOfLines={3}
                        className={`text-start text-md text-neutral-700 ${fontClass}`}
                      >
                        {description}
                      </Text>
                    ) : null}
                  </RaisedCard>
                );
              })}
            </View>
          )}
        </PageWidth>
      </ScrollView>
      <EntityEventSheet event={openEvent} onClose={() => setOpenEventId(null)} />
    </SafeAreaView>
  );
}

export default withScreenEntrance('entity-events', EntityEventsScreen);
