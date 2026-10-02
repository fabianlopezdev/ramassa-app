import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View, type LayoutChangeEvent } from 'react-native';

/** Shared readable heading and explanation for pre-authentication screens. */
export function AuthTitle({
  title,
  subtitle,
  onTitleLayout,
}: {
  readonly title?: string;
  readonly subtitle?: string;
  readonly onTitleLayout?: (event: LayoutChangeEvent) => void;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      {title ? (
        <Text
          onLayout={onTitleLayout}
          accessibilityRole="header"
          className={`text-center text-2xl font-bold text-neutral-900 ${fontClass}`}
        >
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text className={`text-center text-lg text-neutral-700 ${fontClass}`}>{subtitle}</Text>
      ) : null}
    </View>
  );
}
