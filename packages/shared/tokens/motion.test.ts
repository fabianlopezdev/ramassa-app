import { describe, expect, test } from 'bun:test';
import {
  motionTokens,
  resolveDurationMs,
  resolveEntranceTranslateY,
  resolvePressScale,
  resolveShake,
  resolveSpring,
  resolveStaggerMs,
} from './motion';

describe('motionTokens', () => {
  test('durations are ordered fast < base < slow, so a name implies a speed', () => {
    const { fast, base, slow } = motionTokens.duration;
    expect(fast).toBeLessThan(base);
    expect(base).toBeLessThan(slow);
  });

  test('every duration is short enough not to feel sluggish on a low-end device', () => {
    for (const duration of Object.values(motionTokens.duration)) {
      expect(duration).toBeLessThanOrEqual(400);
    }
  });

  test('the press scale is a subtle shrink, never a growth', () => {
    expect(motionTokens.press.scale).toBeGreaterThan(0.9);
    expect(motionTokens.press.scale).toBeLessThan(1);
  });

  test('spring configs are named, not numeric literals at the call site', () => {
    expect(Object.keys(motionTokens.spring).sort()).toEqual(['gentle', 'snappy']);
    for (const spring of Object.values(motionTokens.spring)) {
      expect(spring.damping).toBeGreaterThan(0);
      expect(spring.stiffness).toBeGreaterThan(0);
      expect(spring.mass).toBeGreaterThan(0);
    }
  });

  test('snappy settles faster than gentle', () => {
    expect(motionTokens.spring.snappy.stiffness).toBeGreaterThan(
      motionTokens.spring.gentle.stiffness,
    );
  });
});

describe('reduce-motion is honoured by every resolver, not by each component', () => {
  test('durations collapse to zero, so an animation becomes an instant state change', () => {
    expect(resolveDurationMs('base', false)).toBe(motionTokens.duration.base);
    expect(resolveDurationMs('base', true)).toBe(0);
    expect(resolveDurationMs('slow', true)).toBe(0);
  });

  test('the press shrink disappears rather than shrinking less', () => {
    expect(resolvePressScale(false)).toBe(motionTokens.press.scale);
    expect(resolvePressScale(true)).toBe(1);
  });

  test('entrance slide distance collapses, so content still fades but does not travel', () => {
    expect(resolveEntranceTranslateY(false)).toBe(motionTokens.entrance.translateY);
    expect(resolveEntranceTranslateY(true)).toBe(0);
  });

  test('stagger collapses, so a long list appears at once instead of crawling in', () => {
    expect(resolveStaggerMs(3, false)).toBe(motionTokens.entrance.staggerMs * 3);
    expect(resolveStaggerMs(3, true)).toBe(0);
  });

  test('stagger is capped, so item 200 does not wait seven seconds to appear', () => {
    const cappedDelay = resolveStaggerMs(1000, false);
    expect(cappedDelay).toBe(motionTokens.entrance.maxStaggerMs);
  });

  test('the error shake becomes no movement at all', () => {
    expect(resolveShake(false).offset).toBe(motionTokens.shake.offset);
    expect(resolveShake(true).offset).toBe(0);
  });

  test('springs become critically damped so they settle without oscillating', () => {
    expect(resolveSpring('snappy', false)).toEqual(motionTokens.spring.snappy);
    const reduced = resolveSpring('snappy', true);
    expect(reduced.damping).toBeGreaterThanOrEqual(motionTokens.spring.snappy.damping);
  });
});

describe('platform neutrality', () => {
  test('tokens are plain data, so the admin bundle can import them without Reanimated', () => {
    expect(JSON.parse(JSON.stringify(motionTokens))).toEqual(
      motionTokens as unknown as Record<string, unknown>,
    );
  });
});

test('resolveSpring returns the SAME object for the same inputs (RAPP-20)', () => {
  // A fresh object each call makes the config an unstable effect dependency, so
  // the effect that plays a success haptic re-fires on every render. That bit
  // reduce-motion users specifically: the reduced branch was the one allocating.
  expect(resolveSpring('snappy', false)).toBe(resolveSpring('snappy', false));
  expect(resolveSpring('snappy', true)).toBe(resolveSpring('snappy', true));
  expect(resolveSpring('gentle', true)).toBe(resolveSpring('gentle', true));
  // Still genuinely different configs, not one shared object.
  expect(resolveSpring('snappy', true)).not.toBe(resolveSpring('snappy', false));
});
