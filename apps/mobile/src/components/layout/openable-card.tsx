/**
 * A row that either opens something or does not look tappable (X5). With
 * `onOpen` it is the raised card (RAPP-878): border, edge and forward arrow.
 * Without it the same content renders as a plain block, so a dead end never
 * looks like a door.
 */
import { RaisedCard } from '@/components/layout/raised-card';
import { continuousCorners } from '@/lib/continuous-corners';
import type { ReactNode } from 'react';
import { View } from 'react-native';

export function OpenableCard({
  testID,
  accessibilityLabel,
  onOpen,
  className,
  children,
}: {
  readonly testID?: string;
  readonly accessibilityLabel: string;
  /** Leave out when the row has nothing to open. */
  readonly onOpen?: () => void;
  /** The surface of the plain block, for a row that opens nothing. */
  readonly className?: string;
  readonly children: ReactNode;
}) {
  if (onOpen === undefined) {
    return (
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
  }
  return (
    <RaisedCard testID={testID} accessibilityLabel={accessibilityLabel} onOpen={onOpen}>
      {children}
    </RaisedCard>
  );
}
