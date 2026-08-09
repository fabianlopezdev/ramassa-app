import type { AttendanceStatus } from '@ramassa/shared/attendance';

const ATTENDANCE_OUTBOX_KEY = 'ramassa.attendance-outbox.v1';
const ATTENDANCE_RETRY_BASE_MS = 1_000;
const ATTENDANCE_RETRY_MAX_MS = 30_000;

export interface AttendanceOutboxStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

export interface AttendanceOutboxMark {
  readonly id: string;
  readonly ownerId: string;
  readonly occurrenceId: string;
  readonly playerId: string;
  readonly status: AttendanceStatus;
  readonly markedAt: string;
  readonly attemptCount: number;
  readonly retryAt: string | null;
}

export interface EnqueueAttendanceMark {
  readonly occurrenceId: string;
  readonly playerId: string;
  readonly status: AttendanceStatus;
  readonly markedAt: string;
}

export interface AttendanceDrainResult {
  readonly sent: number;
  readonly failed: number;
  readonly nextRetryAt: string | null;
}

function readEntries(storage: AttendanceOutboxStorage): readonly AttendanceOutboxMark[] {
  const serialized = storage.getString(ATTENDANCE_OUTBOX_KEY);
  if (serialized === undefined) return [];
  try {
    const parsed = JSON.parse(serialized) as { readonly entries?: readonly AttendanceOutboxMark[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

function writeEntries(
  storage: AttendanceOutboxStorage,
  entries: readonly AttendanceOutboxMark[],
): void {
  if (entries.length === 0) {
    storage.remove(ATTENDANCE_OUTBOX_KEY);
    return;
  }
  storage.set(ATTENDANCE_OUTBOX_KEY, JSON.stringify({ version: 1, entries }));
}

export function createAttendanceOutbox(storage: AttendanceOutboxStorage, ownerId: string) {
  return {
    list: (): readonly AttendanceOutboxMark[] =>
      readEntries(storage).filter((entry) => entry.ownerId === ownerId),
    enqueue: (input: EnqueueAttendanceMark): AttendanceOutboxMark => {
      const entry: AttendanceOutboxMark = {
        id: `${ownerId}:${input.occurrenceId}:${input.playerId}`,
        ownerId,
        occurrenceId: input.occurrenceId,
        playerId: input.playerId,
        status: input.status,
        markedAt: input.markedAt,
        attemptCount: 0,
        retryAt: null,
      };
      const entries = readEntries(storage).filter((candidate) => candidate.id !== entry.id);
      writeEntries(storage, [...entries, entry]);
      return entry;
    },
    drain: async (
      send: (mark: AttendanceOutboxMark) => Promise<void>,
      now: Date = new Date(),
    ): Promise<AttendanceDrainResult> => {
      const nowMs = now.getTime();
      const pending = readEntries(storage)
        .filter((entry) => entry.ownerId === ownerId)
        .sort((left, right) => left.markedAt.localeCompare(right.markedAt));
      let sent = 0;
      let failed = 0;
      for (const entry of pending) {
        if (entry.retryAt !== null && Date.parse(entry.retryAt) > nowMs) continue;
        try {
          await send(entry);
          const remaining = readEntries(storage).filter(
            (candidate) => candidate.id !== entry.id || candidate.markedAt !== entry.markedAt,
          );
          writeEntries(storage, remaining);
          sent += 1;
        } catch {
          const nextAttemptCount = entry.attemptCount + 1;
          const delayMs = Math.min(
            ATTENDANCE_RETRY_MAX_MS,
            ATTENDANCE_RETRY_BASE_MS * 2 ** (nextAttemptCount - 1),
          );
          const retryAt = new Date(nowMs + delayMs).toISOString();
          const withFailure = readEntries(storage).map((candidate) =>
            candidate.id === entry.id && candidate.markedAt === entry.markedAt
              ? { ...candidate, attemptCount: nextAttemptCount, retryAt }
              : candidate,
          );
          writeEntries(storage, withFailure);
          failed += 1;
        }
      }
      const nextRetryAt =
        readEntries(storage)
          .filter((entry) => entry.ownerId === ownerId && entry.retryAt !== null)
          .map((entry) => entry.retryAt!)
          .sort()[0] ?? null;
      return { sent, failed, nextRetryAt };
    },
  };
}
