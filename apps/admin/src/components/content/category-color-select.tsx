/**
 * The colour of a category (RAPP-856, RAPP-868, RAPP-869, RAPP-893): one swatch
 * and one picker for every kind of category the dashboard manages, so a change
 * to the palette or its labels reaches every screen. Services and guides choose
 * from the eight hues; a forum or activity category passes `choices` to add the
 * club colour, and the forum passes `noneValue` for a category with no colour.
 * The labels keep their `services:categoryColor*` keys because the player app
 * reads the same keys.
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
import { CATEGORY_COLORS, isCategoryColor } from '@ramassa/shared/category-colors';
import { SECTION_BRAND_COLOR, sectionHue } from '@ramassa/shared/section-colors';

/** The club colour as the dashboard's own theme draws it, so the swatch follows the organization. */
const BRAND_SWATCH_COLOR = 'rgb(var(--ramassa-primary-rgb))';

/**
 * The label of a stored colour; an older value outside the palette shows as it
 * is stored. `noneValue` is the stored name that stands for no colour.
 */
function useCategoryColorLabel(noneValue?: string) {
  const { t } = useTranslation('services');
  return (value: string) => {
    if (value === noneValue) return t('categoryColorNone');
    if (value === SECTION_BRAND_COLOR) return t('categoryColorPrimary');
    return isCategoryColor(value)
      ? t(`categoryColor${value.charAt(0).toUpperCase()}${value.slice(1)}`)
      : value;
  };
}

export function CategoryColorSwatch({
  color,
  className,
}: {
  readonly color: string;
  readonly className?: string;
}) {
  const hue = color === SECTION_BRAND_COLOR ? BRAND_SWATCH_COLOR : sectionHue(color);
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
  choices = CATEGORY_COLORS,
  noneValue,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly testId: string;
  /** The colours on offer; the eight hues unless the caller adds the club colour. */
  readonly choices?: readonly string[];
  /** The stored name for no colour, offered last, such as the forum's `neutral`. */
  readonly noneValue?: string;
}) {
  const id = useId();
  const { t, i18n } = useTranslation('services');
  const colorLabel = useCategoryColorLabel(noneValue);
  const offered = noneValue === undefined ? choices : [...choices, noneValue];
  const options = offered.includes(value) ? offered : [...offered, value];
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
