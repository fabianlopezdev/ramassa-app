import { expect, test } from 'bun:test';
import {
  decodeSupportNeeds,
  encodeSupportNeeds,
  formatSupportNeeds,
  SUPPORT_NEED_CATEGORIES,
  toggleSupportNeed,
} from './support-needs';

test('None is exclusive and removing a category clears its explanation', () => {
  const original = {
    categories: ['accessibility', 'health'] as const,
    details: { accessibility: 'Step-free access', health: 'A break' },
  };
  const none = toggleSupportNeed(original, 'none');
  expect(none).toEqual({ categories: ['none'], details: {} });
  expect(toggleSupportNeed(none, 'other')).toEqual({ categories: ['other'], details: {} });
  expect(toggleSupportNeed(original, 'health').details).toEqual({
    accessibility: 'Step-free access',
  });
});
test('structured needs round-trip without conflating legacy text or None with an unanswered value', () => {
  const value = {
    categories: ['communication'] as const,
    details: { communication: 'An interpreter' },
  };
  expect(decodeSupportNeeds(encodeSupportNeeds(value))).toEqual(value);
  expect(decodeSupportNeeds('Existing free text')).toBeNull();
  expect(encodeSupportNeeds({ categories: [], details: {} })).toBe('');
  expect(encodeSupportNeeds({ categories: ['none'], details: {} })).not.toBe('');
  expect(formatSupportNeeds(encodeSupportNeeds(value), (key) => key)).toBe(
    'onboarding:supportNeedCommunication: An interpreter',
  );
});

test('all five full-length escaped explanations fit while oversized details are rejected', () => {
  const answer = {
    categories: SUPPORT_NEED_CATEGORIES,
    details: Object.fromEntries(
      SUPPORT_NEED_CATEGORIES.map((category) => [category, '"\n'.repeat(1000)]),
    ),
  };
  const encoded = encodeSupportNeeds(answer);
  expect(encoded.length).toBeLessThanOrEqual(32000);
  expect(decodeSupportNeeds(encoded)).toEqual(answer);
  expect(() =>
    encodeSupportNeeds({ categories: ['health'], details: { health: 'h'.repeat(4001) } }),
  ).toThrow();
});

test('a combined explanation round-trips once and is cleared by None', () => {
  const answer = {
    categories: ['accessibility', 'communication'] as const,
    details: {},
    explanation: 'An accessible room and an interpreter',
  };
  const encoded = encodeSupportNeeds(answer);
  expect(decodeSupportNeeds(encoded)).toEqual(answer);
  expect(formatSupportNeeds(encoded, (key) => key)).toBe(
    'onboarding:supportNeedAccessibility, onboarding:supportNeedCommunication\n\nAn accessible room and an interpreter',
  );
  expect(toggleSupportNeed(answer, 'health').explanation).toBe(answer.explanation);
  expect(toggleSupportNeed(answer, 'none')).toEqual({ categories: ['none'], details: {} });
  expect(() => encodeSupportNeeds({ ...answer, explanation: 'x'.repeat(4001) })).toThrow();
  expect(() =>
    encodeSupportNeeds({ categories: ['none'], details: {}, explanation: 'Hidden text' }),
  ).toThrow();
});
