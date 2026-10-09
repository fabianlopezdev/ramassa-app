import { PressableDepth } from '@/components/motion/pressable-depth';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { cssInterop } from 'nativewind';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';
import { AuthChoiceIcon, type AuthChoiceIconName } from './auth-choice-icon';

const BrandSymbol = cssInterop(SymbolView, {
  className: { target: false, nativeStyleToProp: { color: 'tintColor' } },
});
const brandWrapperStyle = {
  paddingEnd: tokens.authChoice.shadowInlineOffset,
  paddingBottom: tokens.authChoice.shadowBlockOffset,
} as const;
const brandShadowStyle = {
  ...continuousCorners,
  position: 'absolute',
  top: tokens.authChoice.shadowBlockOffset,
  start: tokens.authChoice.shadowInlineOffset,
  end: 0,
  bottom: 0,
} as const;
const brandFaceStyle = { ...continuousCorners, minHeight: tokens.authChoice.minHeight } as const;

type AuthRouterCardProps = {
  readonly label: string;
  readonly subline?: string;
  readonly symbol: SymbolViewProps['name'];
  readonly onPress: () => void;
  readonly variant?: 'default' | 'brand';
  readonly solarIcon?: AuthChoiceIconName;
};

export function AuthRouterCard({
  label,
  subline,
  symbol,
  onPress,
  variant = 'default',
  solarIcon,
}: AuthRouterCardProps) {
  const languageFontClass = useLanguageFontClass();
  const accessibilityLabel = subline ? `${label}. ${subline}` : label;

  if (variant === 'brand') {
    return (
      <PressableDepth
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        haptic="tapLight"
        className="relative w-full"
        style={brandWrapperStyle}
        inlineOffset={tokens.authChoice.shadowInlineOffset}
        blockOffset={tokens.authChoice.shadowBlockOffset}
        shadow={
          <View pointerEvents="none" className="rounded-lg bg-primary" style={brandShadowStyle} />
        }
        faceClassName="w-full flex-row items-center gap-md rounded-lg border-2 border-primary bg-secondary p-md"
        faceStyle={brandFaceStyle}
      >
        {solarIcon ? (
          <AuthChoiceIcon name={solarIcon} />
        ) : (
          <BrandSymbol
            name={symbol}
            size={tokens.authChoice.iconSize}
            className="shrink-0 text-primary"
          />
        )}
        <View className="min-w-0 flex-1 gap-xs">
          <Text className={`text-start text-xl font-bold text-primary ${languageFontClass}`}>
            {label}
          </Text>
          {subline ? (
            <Text className={`text-start text-lg text-primary ${languageFontClass}`}>
              {subline}
            </Text>
          ) : null}
        </View>
      </PressableDepth>
    );
  }

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
