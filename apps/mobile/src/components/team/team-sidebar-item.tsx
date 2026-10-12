/**
 * One entry of the tablet sidebar (RAPP-245): an icon and a label, never one
 * without the other, at least the recommended touch height, and announced as
 * the selected tab when it is the open screen. `TabTrigger asChild` passes the
 * press handler and `isFocused`.
 */
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View, type PressableProps } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// TabTrigger hands its child `flexDirection: 'row', justifyContent:
// 'space-between'` as an inline style, which beats classes; these come after
// it and win.
const wideLayout = {
  flexDirection: 'row',
  justifyContent: 'flex-start',
  alignItems: 'center',
} as const;
const compactLayout = {
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
} as const;

type TeamSidebarItemProps = Omit<PressableProps, 'children'> & {
  readonly label: string;
  readonly icon: SymbolViewProps['name'];
  readonly badge?: string | null;
  readonly isFocused?: boolean;
  readonly href?: unknown;
  /** The narrow rail of an upright tablet: the icon over the label. */
  readonly compact?: boolean;
};

export function TeamSidebarItem({
  label,
  icon,
  badge = null,
  isFocused = false,
  compact = false,
  href,
  style,
  ...pressable
}: TeamSidebarItemProps) {
  // TabTrigger passes its href too; the press handler already navigates.
  void href;
  const languageFontClass = useLanguageFontClass();
  return (
    <Pressable
      {...pressable}
      style={[style as object, compact ? compactLayout : wideLayout]}
      accessibilityRole="tab"
      accessibilityLabel={badge === null ? label : `${label}, ${badge}`}
      accessibilityState={{ selected: isFocused }}
      className={`min-h-recommended rounded-md ${
        compact ? 'gap-xs px-xs py-sm' : 'gap-md px-md'
      } ${isFocused ? 'bg-neutral-100' : ''}`}
    >
      <SymbolView
        accessible={false}
        name={icon}
        size={tokens.fontSize.xl}
        tintColor={isFocused ? tokens.colors.primary.dark : tokens.colors.neutral[700]}
      />
      <Text
        className={`${compact ? 'text-center text-xs' : 'flex-1 text-start text-md'} ${
          isFocused ? 'font-bold text-primary-dark' : 'text-neutral-800'
        } ${languageFontClass}`}
      >
        {label}
      </Text>
      {badge === null ? null : (
        <View className="items-center rounded-full bg-error px-sm">
          <Text className="text-xs font-bold text-white">{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}
