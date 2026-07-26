import { type ReactNode } from 'react';
import Animated, {
  FadeInDown,
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
 * The entrance carries MOVEMENT, not just opacity. A plain `FadeIn` made an
 * inserted row look like it simply materialized (found on device): removal reads
 * as motion because the survivors slide up, but an insertion has nothing to
 * slide, so a fade alone gives the eye nothing to follow. It now rises the same
 * `entrance.translateY` distance `FadeSlideIn` uses, so a row arriving in a list
 * and a list appearing for the first time move identically.
 *
 * `FadeInDown` despite the rise: Reanimated names these by the direction the
 * animation travels FROM the offset, so `FadeInDown` starts BELOW (+25 by
 * default) and moves up, while `FadeInUp` starts above and drops. The default
 * offset is overridden with the token so this cannot drift from `FadeSlideIn`.
 *
 * Under reduce-motion, rows appear and disappear with no animation at all:
 * `undefined` (not a zero-duration animation) so Reanimated skips the layout
 * animation machinery entirely rather than running it instantly.
 */
/**
 * Built once at module scope. Reanimated builders are objects, so constructing
 * them in the JSX allocates a new entering/exiting/layout config on every render
 * of every row - the cost lands exactly where it hurts, in a long list.
 */
const ROW_LAYOUT = LinearTransition.duration(motionTokens.duration.base);
const ROW_ENTERING = FadeInDown.duration(motionTokens.duration.base).withInitialValues({
  opacity: 0,
  transform: [{ translateY: motionTokens.entrance.translateY }],
});
const ROW_EXITING = FadeOut.duration(motionTokens.duration.fast);

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
      layout={ROW_LAYOUT}
      entering={ROW_ENTERING}
      exiting={ROW_EXITING}
      className={className}
    >
      {children}
    </Animated.View>
  );
}
