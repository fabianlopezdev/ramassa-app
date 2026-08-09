import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView } from 'expo-symbols';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

interface AttendanceOccurrenceRowProps {
  readonly id: string;
  readonly title: string;
  readonly location: string;
  readonly time: string;
  readonly onOpen: (id: string) => void;
}

export const AttendanceOccurrenceRow = memo(function AttendanceOccurrenceRow({
  id,
  title,
  location,
  time,
  onOpen,
}: AttendanceOccurrenceRowProps) {
  const { t } = useTranslation('attendance');
  const languageFontClass = useLanguageFontClass();
  const handleOpen = useCallback(() => onOpen(id), [id, onOpen]);

  return (
    <PressableScale
      testID={`attendance-occurrence-${id}`}
      accessibilityLabel={t('openSheet', { title })}
      onPress={handleOpen}
      className="min-h-recommended flex-row items-center gap-md rounded-lg border border-neutral-200 bg-white p-md"
    >
      <SymbolView
        accessible={false}
        name={{ ios: 'figure.soccer', android: 'sports_soccer', web: 'sports_soccer' }}
        size={tokens.fontSize['2xl']}
        tintColor={tokens.colors.primary.dark}
      />
      <View className="flex-1 gap-xs">
        <Text className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}>
          {title}
        </Text>
        <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
          {time} · {location}
        </Text>
      </View>
      <SymbolView
        accessible={false}
        name={{ ios: 'chevron.forward', android: 'chevron_right', web: 'chevron_right' }}
        size={tokens.fontSize.lg}
        tintColor={tokens.colors.neutral[500]}
      />
    </PressableScale>
  );
});
