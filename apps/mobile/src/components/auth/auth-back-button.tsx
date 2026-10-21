import { GlassIconSurface } from '@/components/forms/glass-icon-surface';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export function AuthBackButton({ onPress }: { readonly onPress: () => void }) {
  const { t } = useTranslation('common');
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
      <GlassIconSurface>{icon}</GlassIconSurface>
    </PressableScale>
  );
}
