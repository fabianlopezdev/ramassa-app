import { describe, expect, test } from 'bun:test';
import { MENTORING_STATUSES, MENTORING_TOPICS } from '@ramassa/shared/mentoring';
import {
  MENTORING_STATUS_KEYS,
  MENTORING_TOPIC_KEYS,
  preferredSlotParts,
} from './mentoring-labels';

describe('mentoring labels', () => {
  test('every topic and status has a label', () => {
    for (const topic of MENTORING_TOPICS) expect(MENTORING_TOPIC_KEYS[topic]).toBeString();
    for (const status of MENTORING_STATUSES) expect(MENTORING_STATUS_KEYS[status]).toBeString();
  });

  test('no preferred date means no preference to show', () => {
    expect(preferredSlotParts({ preferredDate: null, preferredTime: null }, 'en')).toBeNull();
  });

  test('a preferred date keeps its calendar day in every time zone', () => {
    expect(preferredSlotParts({ preferredDate: '2026-12-03', preferredTime: null }, 'en')).toEqual({
      date: 'Dec 3, 2026',
      time: null,
    });
  });

  test('a preferred time is shown as she chose it', () => {
    expect(
      preferredSlotParts({ preferredDate: '2026-12-03', preferredTime: '17:30:00' }, 'en'),
    ).toEqual({ date: 'Dec 3, 2026', time: '05:30 PM' });
  });
});
