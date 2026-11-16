import { describe, expect, test } from 'bun:test';
import type { MentoringRequest, MentoringStatus } from '@ramassa/shared/mentoring';
import { latestOpenMentoringRequest } from './player-chat-tab';

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
