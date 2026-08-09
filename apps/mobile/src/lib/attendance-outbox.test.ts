import { describe, expect, test } from 'bun:test';
import { createAttendanceOutbox, type AttendanceOutboxStorage } from './attendance-outbox';

function memoryStorage(): AttendanceOutboxStorage {
  const values = new Map<string, string>();
  return {
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

describe('attendance outbox persistence', () => {
  test('a mark survives reconstruction after an app restart', () => {
    const storage = memoryStorage();
    const beforeRestart = createAttendanceOutbox(storage, 'coach-1');

    beforeRestart.enqueue({
      occurrenceId: 'occurrence-1',
      playerId: 'player-1',
      status: 'present',
      markedAt: '2026-08-09T09:00:00.000Z',
    });

    const afterRestart = createAttendanceOutbox(storage, 'coach-1');
    expect(afterRestart.list()).toEqual([
      {
        id: 'coach-1:occurrence-1:player-1',
        ownerId: 'coach-1',
        occurrenceId: 'occurrence-1',
        playerId: 'player-1',
        status: 'present',
        markedAt: '2026-08-09T09:00:00.000Z',
        attemptCount: 0,
        retryAt: null,
      },
    ]);
  });

  test('multiple airplane-mode marks survive restart and all drain after reconnect', async () => {
    const storage = memoryStorage();
    const beforeRestart = createAttendanceOutbox(storage, 'coach-1');
    beforeRestart.enqueue({
      occurrenceId: 'occurrence-1',
      playerId: 'player-1',
      status: 'present',
      markedAt: '2026-08-09T09:00:00.000Z',
    });
    beforeRestart.enqueue({
      occurrenceId: 'occurrence-1',
      playerId: 'player-2',
      status: 'absent',
      markedAt: '2026-08-09T09:00:01.000Z',
    });
    beforeRestart.enqueue({
      occurrenceId: 'occurrence-1',
      playerId: 'player-3',
      status: 'excused',
      markedAt: '2026-08-09T09:00:02.000Z',
    });

    const afterRestart = createAttendanceOutbox(storage, 'coach-1');
    const sent: string[] = [];
    const result = await afterRestart.drain(async (entry) => {
      sent.push(`${entry.playerId}:${entry.status}`);
    });

    expect(sent).toEqual(['player-1:present', 'player-2:absent', 'player-3:excused']);
    expect(result).toEqual({ sent: 3, failed: 0, nextRetryAt: null });
    expect(afterRestart.list()).toEqual([]);
  });

  test('a second tap replaces the pending mark for the same participant', () => {
    const outbox = createAttendanceOutbox(memoryStorage(), 'coach-1');
    outbox.enqueue({
      occurrenceId: 'occurrence-1',
      playerId: 'player-1',
      status: 'present',
      markedAt: '2026-08-09T09:00:00.000Z',
    });
    outbox.enqueue({
      occurrenceId: 'occurrence-1',
      playerId: 'player-1',
      status: 'absent',
      markedAt: '2026-08-09T09:00:01.000Z',
    });

    expect(outbox.list()).toHaveLength(1);
    expect(outbox.list()[0]).toMatchObject({
      status: 'absent',
      markedAt: '2026-08-09T09:00:01.000Z',
    });
  });

  test('draining sends a pending mark and removes it only after success', async () => {
    const outbox = createAttendanceOutbox(memoryStorage(), 'coach-1');
    const pending = outbox.enqueue({
      occurrenceId: 'occurrence-1',
      playerId: 'player-1',
      status: 'excused',
      markedAt: '2026-08-09T09:00:00.000Z',
    });
    const sent: unknown[] = [];

    const result = await outbox.drain(async (mark) => {
      sent.push(mark);
    });

    expect(sent).toEqual([pending]);
    expect(result).toEqual({ sent: 1, failed: 0, nextRetryAt: null });
    expect(outbox.list()).toEqual([]);
  });

  test('an older in-flight send never removes a newer tap for the same participant', async () => {
    const outbox = createAttendanceOutbox(memoryStorage(), 'coach-1');
    outbox.enqueue({
      occurrenceId: 'occurrence-1',
      playerId: 'player-1',
      status: 'present',
      markedAt: '2026-08-09T09:00:00.000Z',
    });
    let releaseSend!: () => void;
    const sending = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const drain = outbox.drain(async () => sending);

    outbox.enqueue({
      occurrenceId: 'occurrence-1',
      playerId: 'player-1',
      status: 'absent',
      markedAt: '2026-08-09T09:00:01.000Z',
    });
    releaseSend();
    await drain;

    expect(outbox.list()).toHaveLength(1);
    expect(outbox.list()[0]).toMatchObject({
      status: 'absent',
      markedAt: '2026-08-09T09:00:01.000Z',
    });
  });

  test('a failed send stays queued and retries after its persisted backoff', async () => {
    const outbox = createAttendanceOutbox(memoryStorage(), 'coach-1');
    outbox.enqueue({
      occurrenceId: 'occurrence-1',
      playerId: 'player-1',
      status: 'present',
      markedAt: '2026-08-09T09:00:00.000Z',
    });
    let attempts = 0;
    const send = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('radio unavailable');
    };

    const failed = await outbox.drain(send, new Date('2026-08-09T09:00:10.000Z'));
    expect(failed).toEqual({
      sent: 0,
      failed: 1,
      nextRetryAt: '2026-08-09T09:00:11.000Z',
    });
    expect(outbox.list()[0]).toMatchObject({
      attemptCount: 1,
      retryAt: '2026-08-09T09:00:11.000Z',
    });

    const tooEarly = await outbox.drain(send, new Date('2026-08-09T09:00:10.500Z'));
    expect(tooEarly.nextRetryAt).toBe('2026-08-09T09:00:11.000Z');
    expect(attempts).toBe(1);

    const retried = await outbox.drain(send, new Date('2026-08-09T09:00:11.000Z'));
    expect(retried).toEqual({ sent: 1, failed: 0, nextRetryAt: null });
    expect(outbox.list()).toEqual([]);
  });
});
