/**
 * One consent as a checkbox row (RAPP-304): her authorization screen and the
 * consents on her profile. The checked state is announced, not only painted.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView } from 'expo-symbols';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export function ConsentRow({
  label,
  required,
  requiredMark,
  checked,
  onToggle,
  testID,
}: {
  readonly label: string;
  readonly required: boolean;
  readonly requiredMark: string;
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly testID: string;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="checkbox"
      isSelected={checked}
      accessibilityLabel={required ? `${label} (${requiredMark})` : label}
      onPress={onToggle}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended flex-row items-start gap-md rounded-md border p-md ${
        checked ? 'border-primary bg-primary/10' : 'border-neutral-300 bg-white'
      }`}
    >
      <View
        className={`mt-xs h-6 w-6 items-center justify-center rounded border-2 ${
          checked ? 'border-primary bg-primary' : 'border-neutral-400 bg-white'
        }`}
      >
        {checked ? (
          <SymbolView
            accessible={false}
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            size={16}
            tintColor={tokens.colors.white}
            weight="bold"
          />
        ) : null}
      </View>
      <View className="flex-1 gap-xs">
        <Text className={`text-start text-md text-neutral-900 ${fontClass}`}>{label}</Text>
        {required ? (
          <Text className={`text-start text-sm font-semibold text-primary-dark ${fontClass}`}>
            {requiredMark}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}
