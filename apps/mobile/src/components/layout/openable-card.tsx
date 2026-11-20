/**
 * A row that either opens something or does not look tappable (X5). With
 * `onOpen` it is the raised card (RAPP-878): border, edge and forward arrow.
 * Without it the same content renders as a plain block, so a dead end never
 * looks like a door. Either way it may carry one badge on its top edge
 * (RAPP-873), such as "Nou".
 */
import { EdgeMarks, type EdgeMarkBadge } from '@/components/layout/edge-marks';
import { RaisedCard } from '@/components/layout/raised-card';
import { continuousCorners } from '@/lib/continuous-corners';
import type { ReactNode } from 'react';
import { View } from 'react-native';

export function OpenableCard({
  testID,
  accessibilityLabel,
  onOpen,
  className,
  badge = null,
  children,
}: {
  readonly testID?: string;
  readonly accessibilityLabel: string;
  /** Leave out when the row has nothing to open. */
  readonly onOpen?: () => void;
  /** The surface of the plain block, for a row that opens nothing. */
  readonly className?: string;
  /** The word on the top edge, while the row holds something new to her. */
  readonly badge?: EdgeMarkBadge | null;
  readonly children: ReactNode;
}) {
  if (onOpen === undefined) {
    const block = (
      <View
        testID={testID}
        accessible
        accessibilityLabel={accessibilityLabel}
        style={continuousCorners}
        className={`gap-xs ${className ?? ''}`}
      >
        {children}
      </View>
    );
    return badge === null ? block : <EdgeMarks badge={badge}>{block}</EdgeMarks>;
  }
  return (
    <RaisedCard
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onOpen={onOpen}
      badge={badge}
    >
      {children}
    </RaisedCard>
  );
}
