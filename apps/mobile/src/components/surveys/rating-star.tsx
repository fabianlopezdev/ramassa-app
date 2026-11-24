/**
 * One star of a survey's rating question (RAPP-963): an outline in the club's
 * colour, filled with it when the rating reaches this star.
 *
 * When she taps a rating, every star up to it pops in turn, a quick swell and
 * tilt that springs back, so the row fills like a wave towards her finger.
 * Stars past the rating empty without a pop. A rating she gave before, shown
 * when the question opens, is filled at once. Under reduced motion the stars
 * fill and empty without moving.
 */
import { useBrandColor } from '@/components/branding/organization-branding-context';
import { Icon } from '@/components/icons/icon';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '@ramassa/shared/tokens';
import { motionTokens, resolveDurationMs, resolveSpring } from '@ramassa/shared/tokens/motion';

const STAR_SIZE = tokens.fontSize['3xl'];
const { staggerMs, peakScale, peakTiltDeg, riseMs } = motionTokens.ratingFill;
const frameStyle: ViewStyle = { width: STAR_SIZE, height: STAR_SIZE };

export function RatingStar({
  isFilled,
  order,
  rating,
}: {
  readonly isFilled: boolean;
  /** Its place in the row from the first star, 0 for the first: the wave reaches it in turn. */
  readonly order: number;
  /** The rating chosen, so every tap pops the filled stars again, also on the same count. */
  readonly rating: number | null;
}) {
  const brandColor = useBrandColor();
  const isReducedMotion = useReducedMotion();
  const fill = useSharedValue(isFilled ? 1 : 0);
  const scale = useSharedValue(1);
  const tilt = useSharedValue(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const fade = resolveDurationMs('fast', isReducedMotion);
    if (!isFilled) {
      fill.set(withTiming(0, { duration: fade }));
      return;
    }
    if (isReducedMotion) {
      fill.set(1);
      return;
    }
    const delay = order * staggerMs;
    const springBack = resolveSpring('snappy', isReducedMotion);
    fill.set(withDelay(delay, withTiming(1, { duration: fade })));
    scale.set(
      withDelay(
        delay,
        withSequence(withTiming(peakScale, { duration: riseMs }), withSpring(1, springBack)),
      ),
    );
    tilt.set(
      withDelay(
        delay,
        withSequence(withTiming(-peakTiltDeg, { duration: riseMs }), withSpring(0, springBack)),
      ),
    );
  }, [fill, isFilled, isReducedMotion, order, rating, scale, tilt]);

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }, { rotate: `${tilt.get()}deg` }],
  }));
  const filledStyle = useAnimatedStyle(() => ({ opacity: fill.get() }));
  const popLayerStyle = useMemo(() => [frameStyle, popStyle], [popStyle]);
  const filledLayerStyle = useMemo(() => [StyleSheet.absoluteFill, filledStyle], [filledStyle]);

  return (
    <Animated.View style={popLayerStyle}>
      <View style={StyleSheet.absoluteFill}>
        <Icon name="star" weight="linear" size={STAR_SIZE} color={brandColor} />
      </View>
      <Animated.View style={filledLayerStyle}>
        <Icon name="star" weight="boldDuotone" size={STAR_SIZE} color={brandColor} />
      </Animated.View>
    </Animated.View>
  );
}
