/**
 * The colour of a category (RAPP-856, RAPP-868, RAPP-869): one swatch and one
 * picker for every kind of category the dashboard manages, services and guides
 * alike, so a change to the palette or its labels reaches every screen. The
 * labels keep their `services:categoryColor*` keys because the player app reads
 * the same keys.
 */

import { INPUT_FRAME_CLASS_NAME } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_COLORS, categoryHue, isCategoryColor } from '@ramassa/shared/category-colors';

/** The label of a stored colour; an older value outside the palette shows as it is stored. */
export function useCategoryColorLabel() {
  const { t } = useTranslation('services');
  return (value: string) =>
    isCategoryColor(value)
      ? t(`categoryColor${value.charAt(0).toUpperCase()}${value.slice(1)}`)
      : value;
}

export function CategoryColorSwatch({
  color,
  className,
}: {
  readonly color: string;
  readonly className?: string;
}) {
  const hue = categoryHue(color);
  return (
    <span
      aria-hidden
      data-slot="category-color-swatch"
      className={cn('size-3 shrink-0 rounded-full', hue === undefined && 'border', className)}
      style={hue === undefined ? undefined : { backgroundColor: hue }}
    />
  );
}

export function CategoryColorSelect({
  value,
  onChange,
  testId,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly testId: string;
}) {
  const id = useId();
  const { t, i18n } = useTranslation('services');
  const colorLabel = useCategoryColorLabel();
  const options = isCategoryColor(value) ? CATEGORY_COLORS : [...CATEGORY_COLORS, value];
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {t('categoryColor')}
      </label>
      <Select dir={i18n.dir()} required value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          data-testid={testId}
          className={cn(
            INPUT_FRAME_CLASS_NAME,
            'w-full min-w-0 px-3 py-1 data-[size=default]:h-9 dark:bg-transparent dark:hover:bg-transparent',
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((option) => (
            <SelectItem key={option} value={option} data-testid={`${testId}-${option}`}>
              <CategoryColorSwatch color={option} />
              {colorLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
