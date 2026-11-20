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

import { outlinedSurfaceClassName } from '@/components/layout/raised-surface';
import { SectionTitle } from '@/components/layout/screen-section';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

/**
 * A titled card of the profile (RAPP-888): the title is the one every tab uses,
 * and the card wears the brand border, like the other outlined surfaces.
 */
export function ProfileSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <View className="gap-sm">
      <SectionTitle title={title} />
      <View style={continuousCorners} className={`gap-xs p-md ${outlinedSurfaceClassName()}`}>
        {children}
      </View>
    </View>
  );
}

export interface ProfileRowProps {
  readonly label: string;
  readonly value: string;
  readonly icon?:
    | 'person'
    | 'calendar'
    | 'location'
    | 'globe'
    | 'conversation'
    | 'document'
    | 'phone'
    | 'home'
    | 'entity'
    | 'people'
    | 'clothing'
    | 'shoes'
    | 'support';
}

export function ProfileRow({ label, value }: ProfileRowProps) {
  const languageFontClass = useLanguageFontClass();
  return (
    // One accessibility node per row, so a screen reader announces "Phone,
    // +34 600 111 222" rather than two disconnected fragments the listener has
    // to reassemble.
    <View accessible accessibilityLabel={`${label}: ${value}`} className="gap-xs py-xs">
      <Text className={`text-start text-form text-neutral-700 ${languageFontClass}`}>{label}</Text>
      {/* Selectable: this screen exists so a woman can READ what the
          organization holds about her, and a document or phone number she can
          long-press and copy is one she can also paste into a form or send to
          someone helping her. */}
      <Text selectable className={`text-start text-form text-neutral-900 ${languageFontClass}`}>
        {value}
      </Text>
    </View>
  );
}
