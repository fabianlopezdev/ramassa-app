/**
 * The one colour picker of the staff app (RAPP-893): a service or guide
 * category, a forum category and an activity category all choose their
 * colour here. Each choice is a raised pill with its name, beside a dot in
 * its shade; the club's colour follows the organization's own. An older
 * stored name outside the choices still shows, so an edit never changes it
 * unseen, and the name that stands for no colour shows an empty ring.
 */
import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FieldLabel } from '@/components/forms/field-label';
import { sectionColorChoices, sectionColorLabelKey } from '@/lib/section-color-choices';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { sectionHue } from '@ramassa/shared/section-colors';

const Swatch = memo(function Swatch({ hue }: { readonly hue: string | undefined }) {
  const style = useMemo(() => (hue === undefined ? undefined : { backgroundColor: hue }), [hue]);
  return (
    <View
      accessible={false}
      className={`h-md w-md rounded-full ${hue === undefined ? 'border border-neutral-400' : ''}`}
      style={style}
    />
  );
});

export function SectionColorPicker({
  label,
  choices,
  value,
  onChange,
  testIDPrefix,
  noColorValue,
}: {
  /** The heading above the choices, in the caller's own namespace. */
  readonly label: string;
  /** The colours on offer, such as `CATEGORY_COLORS` or `SECTION_COLOR_CHOICES`. */
  readonly choices: readonly string[];
  /** The stored colour name. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Each choice's test id is this prefix, a dash and the colour name. */
  readonly testIDPrefix: string;
  /** The stored name that means no colour, such as the forum's `neutral`, offered first. */
  readonly noColorValue?: string;
}) {
  const { t } = useTranslation('services');
  const fontClass = useLanguageFontClass();
  const brandColor = useBrandColor();
  const offered = useMemo(
    () => sectionColorChoices(choices, value, noColorValue),
    [choices, value, noColorValue],
  );
  return (
    <View className="gap-xs">
      <FieldLabel>{label}</FieldLabel>
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-sm">
        {offered.map((color) => {
          const key = sectionColorLabelKey(color, noColorValue);
          const hue = color === noColorValue ? undefined : sectionHue(color, brandColor);
          return (
            <View key={color} className="flex-row items-center gap-xs">
              {hue === undefined && color !== noColorValue ? null : <Swatch hue={hue} />}
              <ChoiceOption
                testID={`${testIDPrefix}-${color}`}
                value={color}
                label={key === undefined ? color : t(key)}
                selected={color === value}
                onSelect={onChange}
                languageFontClass={fontClass}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}
