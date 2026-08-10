import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { SymbolView } from 'expo-symbols';
import { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const soccerSymbol = {
  ios: 'figure.soccer',
  android: 'sports_soccer',
  web: 'sports_soccer',
} as const;
const forwardSymbol = {
  ios: 'chevron.forward',
  android: 'chevron_right',
  web: 'chevron_right',
} as const;

interface AttendanceOccurrenceRowProps {
  readonly id: string;
  readonly title: string;
  readonly location: string;
  readonly time: string;
  readonly accessibilityLabel: string;
  readonly languageFontClass: string;
  readonly onOpen: (id: string) => void;
}

export const AttendanceOccurrenceRow = memo(function AttendanceOccurrenceRow({
  id,
  title,
  location,
  time,
  accessibilityLabel,
  languageFontClass,
  onOpen,
}: AttendanceOccurrenceRowProps) {
  const handleOpen = useCallback(() => onOpen(id), [id, onOpen]);

  return (
    <PressableScale
      testID={`attendance-occurrence-${id}`}
      accessibilityLabel={accessibilityLabel}
      onPress={handleOpen}
      style={continuousCorners}
      className="min-h-recommended flex-row items-center gap-md rounded-lg border border-neutral-200 bg-white p-md"
    >
      <SymbolView
        accessible={false}
        name={soccerSymbol}
        size={tokens.fontSize['2xl']}
        tintColor={tokens.colors.primary.dark}
      />
      <View className="flex-1 gap-xs">
        <Text className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}>
          {title}
        </Text>
        <Text className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}>
          {time} · {location}
        </Text>
      </View>
      <SymbolView
        accessible={false}
        name={forwardSymbol}
        size={tokens.fontSize.lg}
        tintColor={tokens.colors.neutral[500]}
      />
    </PressableScale>
  );
});
