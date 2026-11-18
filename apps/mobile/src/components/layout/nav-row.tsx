/**
 * One large row that opens a screen (RAPP-789, RAPP-794): an icon and a label,
 * never one without the other, at least the recommended touch height. An
 * optional status line sits under the label. The profile menu and the
 * mentoring row on Activitats use it.
 */
import { FORWARD_CHEVRON } from '@/components/icons/direction';
import { Icon, type IconName } from '@/components/icons/icon';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo } from 'react';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export interface NavRowProps {
  readonly label: string;
  readonly icon: IconName;
  readonly onPress: () => void;
  readonly testID: string;
  /** A short state under the label, such as the status of her request. */
  readonly detail?: string | null;
  readonly tone?: 'default' | 'danger';
}

export const NavRow = memo(function NavRow({
  label,
  icon,
  onPress,
  testID,
  detail = null,
  tone = 'default',
}: NavRowProps) {
  const languageFontClass = useLanguageFontClass();
  const accessibilityLabel = [label, detail]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(', ');
  const iconColor = tone === 'danger' ? tokens.colors.error : tokens.colors.primary.dark;
  return (
    <PressableScale
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      haptic="tapLight"
      style={continuousCorners}
      className="min-h-recommended flex-row items-center gap-md rounded-lg border border-neutral-200 bg-white px-md py-sm"
    >
      <Icon name={icon} weight="boldDuotone" size={tokens.fontSize['2xl']} color={iconColor} />
      <View className="flex-1 gap-xs">
        <Text
          className={`text-start text-form font-bold ${
            tone === 'danger' ? 'text-error' : 'text-neutral-900'
          } ${languageFontClass}`}
        >
          {label}
        </Text>
        {detail === null || detail === '' ? null : (
          <Text
            numberOfLines={2}
            className={`text-start text-md text-neutral-700 ${languageFontClass}`}
          >
            {detail}
          </Text>
        )}
      </View>
      {/* An action row (sign out) opens no screen, so it shows no arrow. */}
      {tone === 'danger' ? null : (
        <Icon name={FORWARD_CHEVRON} size={tokens.fontSize.lg} color={tokens.colors.neutral[500]} />
      )}
    </PressableScale>
  );
});
