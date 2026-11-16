import { Text, View } from 'react-native';

interface HomeSectionHeaderProps {
  readonly title: string;
  readonly languageFontClass: string;
  /** Shown at the end of the row, such as "1 de 2". */
  readonly trailing?: string;
}

export function HomeSectionHeader({ title, languageFontClass, trailing }: HomeSectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between gap-sm">
      <Text
        accessibilityRole="header"
        className={`flex-1 text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
      >
        {title}
      </Text>
      {trailing === undefined ? null : (
        <Text
          className={`text-md font-semibold tabular-nums text-neutral-600 ${languageFontClass}`}
        >
          {trailing}
        </Text>
      )}
    </View>
  );
}
