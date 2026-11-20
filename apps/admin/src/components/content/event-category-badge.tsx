import { Badge } from '@/components/ui/badge';
import {
  BriefcaseBusiness,
  Dumbbell,
  Footprints,
  GraduationCap,
  Languages,
  Theater,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  eventCategoryPaletteColor,
  type EventCategoryIcon,
  type EventCategoryRow,
} from '@ramassa/shared/events';
import { CategoryColorSwatch } from './category-color-select';

const ICONS: Readonly<Record<EventCategoryIcon, LucideIcon>> = {
  dumbbell: Dumbbell,
  'graduation-cap': GraduationCap,
  theater: Theater,
  'briefcase-business': BriefcaseBusiness,
  languages: Languages,
  footprints: Footprints,
  users: Users,
};

export function EventCategoryGlyph({
  icon,
  label,
}: {
  readonly icon: EventCategoryIcon;
  readonly label: string;
}) {
  const Icon = ICONS[icon];
  return <Icon role="img" aria-label={label} className="size-4 shrink-0 text-foreground" />;
}

/**
 * An activity category with its swatch from the shared section palette
 * (RAPP-893), the same swatch the other category managers show. An older
 * colour name shows the palette colour it moves to.
 */
export function EventCategoryBadge({ category }: { readonly category: EventCategoryRow }) {
  const color = eventCategoryPaletteColor(category.color);
  return (
    <Badge variant="outline" className="gap-1.5" data-color={color}>
      <CategoryColorSwatch color={color} />
      <EventCategoryGlyph icon={category.icon} label={category.name.ca} />
      <span className="text-foreground">{category.name.ca}</span>
    </Badge>
  );
}
