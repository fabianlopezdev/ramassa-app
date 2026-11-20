/**
 * An event category as the team sees it (RAPP-342): its colour, its icon and
 * its Catalan name, as the web admin's badge shows them.
 */
import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { eventCategoryColor } from '@/components/events/event-card';
import { Icon } from '@/components/icons/icon';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';
import type { EventCategoryRow } from '@ramassa/shared/events';
import { EVENT_ICON_NAMES } from './event-labels';

export function EventCategoryGlyph({
  category,
  size = 18,
}: {
  readonly category: Pick<EventCategoryRow, 'icon' | 'color'>;
  readonly size?: number;
}) {
  const brandColor = useBrandColor();
  return (
    <Icon
      name={EVENT_ICON_NAMES[category.icon]}
      weight="boldDuotone"
      size={size}
      color={eventCategoryColor(category.color, brandColor)}
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
