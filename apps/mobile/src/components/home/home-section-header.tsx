import { Text } from 'react-native';

interface HomeSectionHeaderProps {
  readonly title: string;
  readonly languageFontClass: string;
}

export function HomeSectionHeader({ title, languageFontClass }: HomeSectionHeaderProps) {
  return (
    <Text
      accessibilityRole="header"
      className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
    >
      {title}
    </Text>
  );
}
