import { PressableScale } from '@/components/motion/pressable-scale';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { I18nManager, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const circleStyle = {
  width: tokens.tapTarget.min,
  height: tokens.tapTarget.min,
  borderRadius: tokens.tapTarget.min / 2,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

export function AuthBackButton({ onPress }: { readonly onPress: () => void }) {
  const { t } = useTranslation('common');
  const hasNativeGlass =
    process.env.EXPO_OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const icon = (
    <SymbolView
      name={{
        ios: 'chevron.backward',
        android: I18nManager.isRTL ? 'arrow_forward' : 'arrow_back',
        web: I18nManager.isRTL ? 'arrow_right' : 'arrow_left',
      }}
      size={tokens.spacing.lg}
      tintColor={tokens.colors.neutral[900]}
    />
  );
  return (
    <PressableScale
      testID="auth-back-button"
      accessibilityLabel={t('back')}
      onPress={onPress}
      haptic="selection"
      className="self-start rounded-full"
    >
      {hasNativeGlass ? (
        <GlassView
          style={circleStyle}
          glassEffectStyle="regular"
          colorScheme="light"
          isInteractive
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {icon}
        </GlassView>
      ) : (
        <View
          style={circleStyle}
          className="border border-neutral-200 bg-white/80 shadow-sm"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {icon}
        </View>
      )}
    </PressableScale>
  );
}
