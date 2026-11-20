import { describe, expect, test } from 'bun:test';
import type { AnnouncementListRow } from '@ramassa/shared/announcements';
import type { EventSignupState, PlayerEventOccurrence } from '@ramassa/shared/events';
import type { HomeSeen } from '@ramassa/shared/home-seen';
import type { PendingCustomForm } from '@ramassa/shared/intake-builder';
import { buildHomeAttention, type HomeAttentionSources } from './home-attention';

const now = new Date('2026-11-16T10:00:00Z');
const SINCE = '2026-11-01T00:00:00Z';
const PUBLISHED = '2026-11-10T10:00:00Z';
const BEFORE_PUBLISHED = '2026-11-09T10:00:00Z';
const AFTER_PUBLISHED = '2026-11-11T10:00:00Z';

function activity(signupState: EventSignupState | null = null): PlayerEventOccurrence {
  return {
    occurrence_id: 'next-1',
    occurrence_starts_at: '2026-11-17T10:00:00Z',
    occurrence_ends_at: null,
    event: {
      id: 'next',
      category_id: 'category',
      status: 'published',
      published_at: PUBLISHED,
      expires_at: null,
    },
    signup: signupState === null ? null : { id: 'signup-next', state: signupState },
  } as unknown as PlayerEventOccurrence;
}

function announcement(id: string): AnnouncementListRow {
  return {
    id,
    category: 'general',
    status: 'published',
    published_at: PUBLISHED,
    expires_at: null,
    is_pinned: false,
  } as unknown as AnnouncementListRow;
}

function form(responseId: string): PendingCustomForm {
  return { responseId } as unknown as PendingCustomForm;
}

function seenRecord(eventIds: readonly string[] = []): HomeSeen {
  return { since: SINCE, announcementIds: [], eventIds };
}

function sources(overrides: Partial<HomeAttentionSources> = {}): HomeAttentionSources {
  return {
    forms: undefined,
    surveys: undefined,
    events: [activity()],
    announcements: undefined,
    seen: seenRecord(),
    homeSeenAt: null,
    ...overrides,
  };
}

describe('buildHomeAttention, the next activity', () => {
  test('a new activity on an Inici list she has never seen adds 1 and says Nou', () => {
    const home = buildHomeAttention(sources(), now);
    expect(home.isNextActivityUnseen).toBe(true);
    expect(home.isNextActivityCounted).toBe(true);
    expect(home.count).toBe(1);
  });

  test('a new activity published after she last saw Inici adds 1', () => {
    const home = buildHomeAttention(sources({ homeSeenAt: BEFORE_PUBLISHED }), now);
    expect(home.isNextActivityCounted).toBe(true);
    expect(home.count).toBe(1);
  });

  test('once she has seen Inici the number clears and the card still says Nou', () => {
    const home = buildHomeAttention(sources({ homeSeenAt: AFTER_PUBLISHED }), now);
    expect(home.isNextActivityUnseen).toBe(true);
    expect(home.isNextActivityCounted).toBe(false);
    expect(home.count).toBe(0);
  });

  test('before the news loads the activity adds nothing and the card still says Nou', () => {
    const home = buildHomeAttention(sources({ homeSeenAt: undefined }), now);
    expect(home.isNextActivityUnseen).toBe(true);
    expect(home.isNextActivityCounted).toBe(false);
    expect(home.count).toBe(0);
  });

  test('opening the activity clears both its Nou and its number', () => {
    const home = buildHomeAttention(sources({ seen: seenRecord(['next']) }), now);
    expect(home.isNextActivityUnseen).toBe(false);
    expect(home.isNextActivityCounted).toBe(false);
    expect(home.count).toBe(0);
  });

  test('an activity she answered neither says Nou nor counts', () => {
    const home = buildHomeAttention(sources({ events: [activity('cancelled')] }), now);
    expect(home.isNextActivityUnseen).toBe(false);
    expect(home.isNextActivityCounted).toBe(false);
    expect(home.count).toBe(0);
  });

  test('forms and unopened announcements count whether or not she has seen Inici', () => {
    const others = {
      forms: [form('a')],
      announcements: [announcement('notice')],
      seen: seenRecord(['next']),
    };
    expect(buildHomeAttention(sources({ ...others, homeSeenAt: undefined }), now).count).toBe(2);
    expect(buildHomeAttention(sources({ ...others, homeSeenAt: AFTER_PUBLISHED }), now).count).toBe(
      2,
    );
  });
});
