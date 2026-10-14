/**
 * An event category as the team sees it (RAPP-342): its colour, its icon and
 * its Catalan name, as the web admin's badge shows them.
 */
import { eventCategoryColor } from '@/components/events/event-card';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView } from 'expo-symbols';
import { Text, View } from 'react-native';
import type { EventCategoryRow } from '@ramassa/shared/events';
import { EVENT_ICON_SYMBOLS } from './event-labels';

export function EventCategoryGlyph({
  category,
  size = 18,
}: {
  readonly category: Pick<EventCategoryRow, 'icon' | 'color'>;
  readonly size?: number;
}) {
  return (
    <SymbolView
      name={EVENT_ICON_SYMBOLS[category.icon]}
      size={size}
      tintColor={eventCategoryColor(category.color)}
    />
  );
}

export function EventCategoryBadge({ category }: { readonly category: EventCategoryRow }) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="flex-row items-center gap-xs">
      <EventCategoryGlyph category={category} />
      <Text className={`text-start text-sm font-semibold text-neutral-800 ${fontClass}`}>
        {category.name.ca}
      </Text>
    </View>
  );
}
