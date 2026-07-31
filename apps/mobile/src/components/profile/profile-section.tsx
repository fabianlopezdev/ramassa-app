/**
 * The read view's building blocks (RAPP-22): a titled group and a label/value
 * row.
 *
 * Values are shown in full, including the encrypted ones. That is the point of
 * the screen: a woman opens it to check what the organization holds about her,
 * and a masked document number answers the question with "we are not telling
 * you". The protection those fields need is at rest and in transit, which the
 * database and the read RPC provide; hiding them from their owner protects
 * nobody.
 */

import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-semibold text-neutral-900 ${languageFontClass}`}
      >
        {title}
      </Text>
      <View className="gap-xs rounded-md border border-neutral-200 bg-white p-md">{children}</View>
    </View>
  );
}

export function ProfileRow({ label, value }: { label: string; value: string }) {
  const languageFontClass = useLanguageFontClass();
  return (
    // One accessibility node per row, so a screen reader announces "Phone,
    // +34 600 111 222" rather than two disconnected fragments the listener has
    // to reassemble.
    <View accessible accessibilityLabel={`${label}: ${value}`} className="gap-xs py-xs">
      <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>{label}</Text>
      <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>{value}</Text>
    </View>
  );
}
