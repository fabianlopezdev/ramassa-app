/**
 * The partner entity's Events tab on the phone (RAPP-412), as the web portal's
 * events page: the published upcoming events, read only, with the title and
 * description in her language, the date and time where the event happens,
 * the place and a recurring mark.
 */
import { PageWidth } from '@/components/layout/content-width';
import { continuousCorners } from '@/lib/continuous-corners';
import { useEntityUpcomingEvents } from '@/lib/entity-portal';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DEFAULT_LANGUAGE,
  resolveLocalizedText,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

export default function EntityEventsScreen() {
  const { t, i18n } = useTranslation('entity-management');
  const fontClass = useLanguageFontClass();
  const events = useEntityUpcomingEvents();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const rows = events.data ?? [];

  return (
    <SafeAreaView
      testID="entity-events"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('eventsTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('eventsIntro')}
            </Text>
          </View>
          {events.data !== undefined && rows.length === 0 ? (
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
                  <View
                    key={event.id}
                    testID={`entity-event-${event.id}`}
                    style={continuousCorners}
                    className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
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
                      <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
                        {description}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
