import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View, type LayoutChangeEvent } from 'react-native';

/** Shared readable heading and explanation for login and wizard screens. */
export function AuthTitle({
  title,
  subtitle,
  onTitleLayout,
  align = 'center',
}: {
  readonly align?: 'center' | 'start';
  readonly title?: string;
  readonly subtitle?: string;
  readonly onTitleLayout?: (event: LayoutChangeEvent) => void;
}) {
  const fontClass = useLanguageFontClass();
  const alignmentClass = align === 'start' ? 'text-start' : 'text-center';
  return (
    <View className="gap-sm">
      {title ? (
        <Text
          onLayout={onTitleLayout}
          accessibilityRole="header"
          className={`${alignmentClass} text-2xl font-bold text-neutral-900 ${fontClass}`}
        >
          {title}
        </Text>
      ) : null}
      {/* Selectable because after the code is sent the subtitle names the
          address it went to, which a player may want to copy and check. */}
      {subtitle ? (
        <Text selectable className={`${alignmentClass} text-form text-neutral-700 ${fontClass}`}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
