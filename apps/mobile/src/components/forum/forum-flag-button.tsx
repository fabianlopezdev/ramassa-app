/**
 * The red flag a player taps to tell the staff about something (RAPP-892): a
 * forum post or answer, or a gallery photo or video. It opens `ForumFlagDialog`.
 *
 * It is the small raised icon button the owner chose for the forum thread
 * (RAPP-884): the flag alone on the small face, in red, with the long sentence
 * read by the screen reader and a touch that reaches past the face to a full
 * tap target. Every report control is this one component, so the screens that
 * report cannot drift apart.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import {
  raisedIconHitSlop,
  raisedIconStartReachBeforeNeighbour,
} from '@/components/layout/raised-surface';
import { memo, useMemo } from 'react';
import { I18nManager } from 'react-native';

export const ForumFlagButton = memo(function ForumFlagButton({
  accessibilityLabel,
  onPress,
  isDisabled = false,
  testID,
  endNeighbourHalfGap,
}: {
  /** What the screen reader says, such as "Avisa l'equip tècnic sobre aquesta publicació". */
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly isDisabled?: boolean;
  readonly testID?: string;
  /**
   * Half the gap to a button at its end, such as reply beside it on a forum
   * message. The touch then reaches only that far towards it, and the rest of
   * the tap target reaches the other way. Without a neighbour it reaches evenly
   * round the face.
   */
  readonly endNeighbourHalfGap?: number;
}) {
  const hitSlop = useMemo(
    () =>
      endNeighbourHalfGap === undefined
        ? undefined
        : raisedIconHitSlop(
            'small',
            raisedIconStartReachBeforeNeighbour('small', endNeighbourHalfGap),
            I18nManager.isRTL,
          ),
    [endNeighbourHalfGap],
  );
  return (
    <RaisedActionButton
      testID={testID}
      size="compact"
      icon="flag"
      tone="danger"
      isLabelHidden
      iconFace="small"
      hitSlop={hitSlop}
      label={accessibilityLabel}
      onPress={onPress}
      isDisabled={isDisabled}
    />
  );
});
