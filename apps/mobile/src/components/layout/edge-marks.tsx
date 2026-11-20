/**
 * The marks on the top edge of a raised surface: a word badge near the start
 * ("Nou", a sign-up state; RAPP-840) and a count in a circle near the end
 * (unread messages, new announcements; RAPP-842, RAPP-848). They sit half
 * above the border and half inside, so they read as labels on the surface.
 * The card and the filter chip share this, so a mark sits in the same place
 * everywhere.
 *
 * The marks are drawn over the surface from outside it, because its face
 * clips what it holds. The room above keeps them clear of what comes before.
 * Their words are not read out here: the surface's own label carries them.
 *
 * A surface that fills a cell of a row, such as a half card (RAPP-874), an
 * Ajuda tile or an option of the segmented control (RAPP-873), passes
 * `className="flex-1"`: the marks then grow with the cell, so the surface
 * inside still stretches to the row's height and the cells stay level.
 */
import { Badge, type BadgeTone } from '@/components/layout/badge';
import { CountBubble } from '@/components/layout/count-bubble';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { View } from 'react-native';

export interface EdgeMarkBadge {
  readonly label: string;
  readonly tone: BadgeTone;
}

export function EdgeMarks({
  badge = null,
  count = null,
  className,
  children,
}: {
  readonly badge?: EdgeMarkBadge | null;
  readonly count?: string | null;
  /**
   * Such as `flex-1`, so a half card (RAPP-874), an Ajuda tile or an option
   * of the segmented control (RAPP-873) fills its cell.
   */
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View className={`relative pt-sm ${className ?? ''}`}>
      {children}
      {badge === null ? null : (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="absolute start-lg top-sm -translate-y-1/2"
        >
          <Badge label={badge.label} tone={badge.tone} languageFontClass={languageFontClass} />
        </View>
      )}
      {count === null ? null : (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="absolute end-lg top-sm -translate-y-1/2"
        >
          <CountBubble label={count} />
        </View>
      )}
    </View>
  );
}
