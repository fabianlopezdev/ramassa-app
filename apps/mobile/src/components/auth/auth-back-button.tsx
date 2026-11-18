import { GlassIconSurface } from '@/components/forms/glass-icon-surface';
import { BACKWARD_CHEVRON } from '@/components/icons/direction';
import { Icon } from '@/components/icons/icon';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useTranslation } from 'react-i18next';
import { tokens } from '@ramassa/shared/tokens';

export function AuthBackButton({ onPress }: { readonly onPress: () => void }) {
  const { t } = useTranslation('common');
  const icon = (
    <Icon name={BACKWARD_CHEVRON} size={tokens.spacing.lg} color={tokens.colors.neutral[900]} />
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
