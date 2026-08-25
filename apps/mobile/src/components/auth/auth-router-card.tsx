import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

type AuthRouterCardProps = {
  readonly label: string;
  readonly subline?: string;
  readonly symbol: SymbolViewProps['name'];
  readonly onPress: () => void;
};

export function AuthRouterCard({ label, subline, symbol, onPress }: AuthRouterCardProps) {
  const languageFontClass = useLanguageFontClass();
  const accessibilityLabel = subline ? `${label}. ${subline}` : label;

  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      haptic="tapLight"
      style={continuousCorners}
      className="min-h-recommended flex-row items-center gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <View
        importantForAccessibility="no-hide-descendants"
        className="h-recommended w-recommended items-center justify-center rounded-full bg-neutral-50"
      >
        <SymbolView name={symbol} size={24} tintColor={tokens.colors.primary.dark} />
      </View>
      <View importantForAccessibility="no-hide-descendants" className="min-w-0 flex-1 gap-2xs">
        <Text className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}>
          {label}
        </Text>
        {subline ? (
          <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
            {subline}
          </Text>
        ) : null}
      </View>
      <SymbolView
        name={{ ios: 'chevron.forward', android: 'chevron_right', web: 'chevron_right' }}
        size={20}
        tintColor={tokens.colors.neutral[500]}
      />
    </PressableScale>
  );
}
