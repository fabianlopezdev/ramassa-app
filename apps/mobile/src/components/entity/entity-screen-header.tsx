/**
 * The header of an entity tab (RAPP-803): the settings button at the leading
 * edge, the title beside it, and the intro under both. The row follows the
 * reading direction, so the button sits at the start in every language.
 */
import { EntityAccountButton } from '@/components/entity/entity-account-menu';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';

export function EntityScreenHeader({
  title,
  intro,
}: {
  readonly title: string;
  readonly intro: string;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-xs">
      <View className="flex-row items-center gap-md">
        <EntityAccountButton />
        <Text
          accessibilityRole="header"
          className={`flex-1 text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
        >
          {title}
        </Text>
      </View>
      <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>{intro}</Text>
    </View>
  );
}
