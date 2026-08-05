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
import type {
  EventCategoryColor,
  EventCategoryIcon,
  EventCategoryRow,
} from '@ramassa/shared/events';

const ICONS: Readonly<Record<EventCategoryIcon, LucideIcon>> = {
  dumbbell: Dumbbell,
  'graduation-cap': GraduationCap,
  theater: Theater,
  'briefcase-business': BriefcaseBusiness,
  languages: Languages,
  footprints: Footprints,
  users: Users,
};

const COLORS: Readonly<Record<EventCategoryColor, string>> = {
  primary: 'border-primary/30 bg-primary/10 text-primary',
  secondary: 'border-secondary bg-secondary text-secondary-foreground',
  accent: 'border-accent bg-accent text-accent-foreground',
  'chart-1': 'border-chart-1/50 bg-chart-1/20 text-foreground',
  'chart-2': 'border-chart-2/50 bg-chart-2/20 text-foreground',
  'chart-3': 'border-chart-3/50 bg-chart-3/20 text-foreground',
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

export function EventCategoryBadge({ category }: { readonly category: EventCategoryRow }) {
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 ${COLORS[category.color]}`}
      data-color={category.color}
    >
      <EventCategoryGlyph icon={category.icon} label={category.name.ca} />
      <span className="text-foreground">{category.name.ca}</span>
    </Badge>
  );
}
