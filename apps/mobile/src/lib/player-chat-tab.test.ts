import { describe, expect, test } from 'bun:test';
import type { MentoringRequest, MentoringStatus } from '@ramassa/shared/mentoring';
import { EMPTY_TAB_NEWS, type TabNews } from '@ramassa/shared/tab-news';
import {
  contactCardAccessibilityLabel,
  contactCardNewsCounts,
  latestOpenMentoringRequest,
} from './player-chat-tab';

function request(id: string, status: MentoringStatus, createdAt: string): MentoringRequest {
  return {
    id,
    topic: 'other',
    topicDetail: null,
    preferredDate: null,
    preferredTime: null,
    status,
    scheduledAt: null,
    assignedStaffName: null,
    completedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('latestOpenMentoringRequest', () => {
  test('is null when she has no request', () => {
    expect(latestOpenMentoringRequest([])).toBeNull();
  });

  test('ignores completed and cancelled requests', () => {
    expect(
      latestOpenMentoringRequest([
        request('a', 'completed', '2026-11-10T10:00:00Z'),
        request('b', 'cancelled', '2026-11-12T10:00:00Z'),
      ]),
    ).toBeNull();
  });

  test('picks the most recent open request whatever the list order', () => {
    const latest = latestOpenMentoringRequest([
      request('old', 'scheduled', '2026-11-01T10:00:00Z'),
      request('closed', 'completed', '2026-11-15T10:00:00Z'),
      request('new', 'requested', '2026-11-10T10:00:00Z'),
    ]);
    expect(latest?.id).toBe('new');
  });
});

// RAPP-873: the Mentoria and Suggeriments cards carry the same number the tab adds up.
describe('contactCardNewsCounts', () => {
  test('is zero on both cards while the news is not loaded', () => {
    expect(contactCardNewsCounts(undefined)).toEqual({ mentoring: 0, feedback: 0 });
  });

  test('counts her requests and suggestions the staff changed', () => {
    const news: TabNews = {
      ...EMPTY_TAB_NEWS,
      mentoring: { changedRequestIds: ['r1', 'r2'] },
      feedback: { changedSubmissionIds: ['f1'] },
    };
    expect(contactCardNewsCounts(news)).toEqual({ mentoring: 2, feedback: 1 });
  });
});

describe('contactCardAccessibilityLabel', () => {
  const sayNewCount = (label: string, count: number) => `${label}, ${count} new`;

  test('is the title alone with no state and nothing new', () => {
    expect(contactCardAccessibilityLabel('Mentoria', null, 0, sayNewCount)).toBe('Mentoria');
  });

  test('keeps the state it says today when nothing is new', () => {
    expect(contactCardAccessibilityLabel('Mentoria', 'Programada', 0, sayNewCount)).toBe(
      'Mentoria, Programada',
    );
  });

  test('says the title, the state and then the count', () => {
    expect(contactCardAccessibilityLabel('Mentoria', 'Programada', 2, sayNewCount)).toBe(
      'Mentoria, Programada, 2 new',
    );
  });

  test('says the count after the title when there is no state', () => {
    expect(contactCardAccessibilityLabel('Suggeriments', null, 1, sayNewCount)).toBe(
      'Suggeriments, 1 new',
    );
  });
});
