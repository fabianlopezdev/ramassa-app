import { DataIcon } from '@/components/forms/data-icon';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { SymbolViewProps } from 'expo-symbols';
import { Text, View } from 'react-native';

/** The icon of a point when the screen gives none: a plain tick. */
const POINT_SYMBOL: SymbolViewProps['name'] = {
  ios: 'checkmark.circle',
  android: 'check_circle',
  web: 'check_circle',
};

/**
 * Points she reads, each a title and a text after its icon: the app terms'
 * introduction (RAPP-613) and a points block of any form screen (RAPP-770).
 * `symbols` gives the icons in order, the last one repeating; without them
 * every point shows a tick.
 */
export function PointsBlock({
  points,
  symbols = [POINT_SYMBOL],
  testID,
}: {
  readonly points: readonly { readonly title: string; readonly body: string }[];
  readonly symbols?: readonly SymbolViewProps['name'][];
  readonly testID?: string;
}) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="gap-lg" testID={testID}>
      {points.map((point, index) => (
        <View key={index} className="flex-row items-start gap-sm">
          <DataIcon name={symbols[Math.min(index, symbols.length - 1)] ?? POINT_SYMBOL} />
          <View className="flex-1 gap-xs">
            <Text
              className={`text-start text-form font-bold text-neutral-900 ${languageFontClass}`}
            >
              {point.title}
            </Text>
            <Text
              className={`text-start text-form leading-body text-neutral-700 ${languageFontClass}`}
            >
              {point.body}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
