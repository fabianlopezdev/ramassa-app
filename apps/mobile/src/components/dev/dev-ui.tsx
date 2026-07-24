import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * The dev menu's layout primitives (RAPP-19).
 *
 * Deliberately plain: this screen is never seen by a player, so it does NOT
 * reach for the shared premium-motion primitives (RAPP-70) or translation keys.
 * It still uses design tokens for every value and keeps 48dp targets, because
 * the token rule is codebase-wide and a menu you keep mis-tapping is a slow
 * menu. Variants are separate components rather than boolean props, so a caller
 * cannot ask for a destructive-but-not-really button.
 */

export function DevSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-sm rounded-lg border border-neutral-200 bg-white p-md">
      <Text accessibilityRole="header" className="text-md font-bold text-neutral-900">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** A one-line explanation under a section header, for gaps and caveats. */
export function DevNote({ children }: { children: string }) {
  return <Text className="text-sm text-neutral-500">{children}</Text>;
}

export function DevRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row flex-wrap items-baseline justify-between gap-xs border-b border-neutral-100 py-xs">
      <Text className="text-sm text-neutral-500">{label}</Text>
      <Text selectable className="text-start text-sm font-medium text-neutral-900">
        {value}
      </Text>
    </View>
  );
}

export function DevButtonRow({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-sm">{children}</View>;
}

interface DevButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly isActive?: boolean;
}

function DevButtonBase({
  label,
  onPress,
  className,
  textClassName,
}: DevButtonProps & { className: string; textClassName: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-min items-center justify-center rounded-md px-md py-sm active:opacity-70 ${className}`}
    >
      <Text className={`text-sm font-medium ${textClassName}`}>{label}</Text>
    </Pressable>
  );
}

export function DevButton({ label, onPress, isActive = false }: DevButtonProps) {
  return (
    <DevButtonBase
      label={label}
      onPress={onPress}
      className={isActive ? 'bg-primary' : 'bg-neutral-100'}
      textClassName={isActive ? 'text-white' : 'text-neutral-800'}
    />
  );
}

/** For anything that signs out, wipes storage, or throws. */
export function DevDangerButton({ label, onPress }: DevButtonProps) {
  return (
    <DevButtonBase
      label={label}
      onPress={onPress}
      className="bg-error"
      textClassName="text-white"
    />
  );
}
