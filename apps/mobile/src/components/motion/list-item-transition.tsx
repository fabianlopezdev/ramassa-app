import { type ReactNode } from 'react';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';
import { motionTokens } from '@ramassa/shared/tokens/motion';

/**
 * Layout transitions for list add/remove (RAPP-70 scope item 2, last bullet).
 *
 * Wrap each row of a list whose contents change while on screen: chat messages
 * arriving, a feed refreshing, attendance marks toggling. Without this, an
 * inserted row makes every row below it jump to its new position in a single
 * frame, which reads as a glitch; with it, they slide.
 *
 * `LinearTransition` is a Reanimated LAYOUT animation: the neighbours' movement
 * is driven natively rather than by animating our own `transform`, which is the
 * one case where letting the layout engine animate is correct, because the
 * positions genuinely changed.
 *
 * Under reduce-motion, rows appear and disappear with no animation at all:
 * `undefined` (not a zero-duration animation) so Reanimated skips the layout
 * animation machinery entirely rather than running it instantly.
 */
export interface ListItemTransitionProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ListItemTransition({ children, className }: ListItemTransitionProps) {
  const isReducedMotion = useReducedMotion();

  if (isReducedMotion) {
    return <Animated.View className={className}>{children}</Animated.View>;
  }

  return (
    <Animated.View
      layout={LinearTransition.duration(motionTokens.duration.base)}
      entering={FadeIn.duration(motionTokens.duration.base)}
      exiting={FadeOut.duration(motionTokens.duration.fast)}
      className={className}
    >
      {children}
    </Animated.View>
  );
}
