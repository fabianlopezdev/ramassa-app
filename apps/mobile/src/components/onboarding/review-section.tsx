import { GlassIconSurface } from '@/components/forms/glass-icon-surface';
import { PressableScale } from '@/components/motion/pressable-scale';
import type { ProfileRowProps } from '@/components/profile/profile-section';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { cssInterop } from 'nativewind';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const symbols = {
  person: { ios: 'person', android: 'person', web: 'person' },
  calendar: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  globe: { ios: 'globe', android: 'language', web: 'language' },
  conversation: { ios: 'bubble', android: 'chat_bubble', web: 'chat_bubble' },
  document: { ios: 'doc.text', android: 'description', web: 'description' },
  phone: { ios: 'phone', android: 'call', web: 'call' },
  home: { ios: 'house', android: 'home', web: 'home' },
  entity: { ios: 'building.2', android: 'apartment', web: 'apartment' },
  people: { ios: 'person.2', android: 'group', web: 'group' },
  clothing: { ios: 'tshirt', android: 'checkroom', web: 'checkroom' },
  shoes: { ios: 'shoe', android: 'footprint', web: 'footprint' },
  support: { ios: 'heart', android: 'favorite', web: 'favorite' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
} as const satisfies Record<string, SymbolViewProps['name']>;

const ThemedSymbol = cssInterop(SymbolView, {
  className: { target: false, nativeStyleToProp: { color: 'tintColor' } },
});

const circleStyle = {
  width: tokens.tapTarget.min,
  height: tokens.tapTarget.min,
  borderRadius: tokens.radius.full,
  flexShrink: 0,
} as const;
const headingStyle = { flexBasis: tokens.formField.width.medium } as const;

function ReviewSymbol({ name }: { readonly name: keyof typeof symbols }) {
  return (
    <ThemedSymbol
      accessible={false}
      name={symbols[name]}
      size={tokens.spacing.lg}
      className="text-primary-dark"
    />
  );
}

/** Icon-only correction action with the same accessible target on every section. */
export function ReviewEditAction({
  label,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      haptic="tapLight"
      className="min-h-recommended min-w-recommended items-center justify-center self-start rounded-full"
    >
      <GlassIconSurface>
        <ReviewSymbol name="edit" />
      </GlassIconSurface>
    </PressableScale>
  );
}

/** Shared confirmation layout, with the correction action next to its heading. */
export function ReviewSection({
  title,
  action,
  children,
}: {
  readonly title: string;
  readonly action: ReactNode;
  readonly children: ReactNode;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      <View className="flex-row flex-wrap items-center justify-between gap-sm">
        <Text
          accessibilityRole="header"
          style={headingStyle}
          className={`flex-grow text-start text-2xl font-extrabold text-primary-dark ${fontClass}`}
        >
          {title}
        </Text>
        {action}
      </View>
      <View>{children}</View>
    </View>
  );
}

export function ReviewRow({ label, value, icon = 'document' }: ProfileRowProps) {
  const fontClass = useLanguageFontClass();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      className="flex-row items-center gap-md border-b border-neutral-200 py-md"
    >
      <View
        style={circleStyle}
        className="items-center justify-center bg-secondary/20"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <ReviewSymbol name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-xs">
        <Text className={`text-start text-form text-neutral-700 ${fontClass}`}>{label}</Text>
        <Text
          selectable
          className={`text-start text-form font-bold text-primary-dark ${fontClass}`}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}
