import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

/**
 * The pre-content empty state a not-yet-built tab renders (RAPP-16). The five
 * player tabs exist as a navigable shell before their features land, so the tab
 * bar, its translated labels, and RTL mirroring can all be verified now (the
 * `shell-tabs` flow, RAPP-78). The caller passes an already-translated title;
 * `accessibilityRole="header"` gives screen-reader users a landmark per screen.
 */
export function ScreenPlaceholder({ title, children }: { title: string; children?: ReactNode }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="flex-1 items-center justify-center gap-lg bg-white px-lg">
      <Text
        accessibilityRole="header"
        className={`text-xl font-semibold text-neutral-900 ${languageFontClass}`}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
