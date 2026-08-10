import {
  nextAttendanceMarkedAt,
  nextAttendanceStatus,
  type AttendanceStatus,
} from '@ramassa/shared/attendance';

const ATTENDANCE_OUTBOX_KEY = 'ramassa.attendance-outbox.v1';
const ATTENDANCE_OUTBOX_SCHEMA_VERSION = 1;
const ATTENDANCE_RETRY_BASE_MS = 1_000;
const ATTENDANCE_RETRY_MAX_MS = 30_000;
const ATTENDANCE_RETRY_BACKOFF_BASE = 2;

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

export function nextAttendanceOutboxMark(
  pending: AttendanceOutboxMark | undefined,
  currentStatus: AttendanceStatus | null,
  currentMarkedAt: string | null,
  now = new Date(),
): Pick<EnqueueAttendanceMark, 'status' | 'markedAt'> {
  return {
    status: nextAttendanceStatus(pending?.status ?? currentStatus),
    markedAt: nextAttendanceMarkedAt(pending?.markedAt ?? currentMarkedAt, now),
  };
}

const drainTails = new WeakMap<AttendanceOutboxStorage, Map<string, Promise<void>>>();

async function serializeDrain<Result>(
  storage: AttendanceOutboxStorage,
  ownerId: string,
  execute: () => Promise<Result>,
): Promise<Result> {
  let ownerTails = drainTails.get(storage);
  if (ownerTails === undefined) {
    ownerTails = new Map();
    drainTails.set(storage, ownerTails);
  }
  const previous = ownerTails.get(ownerId);
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = (previous ?? Promise.resolve()).then(() => turn);
  ownerTails.set(ownerId, tail);
  if (previous !== undefined) await previous;
  try {
    return await execute();
  } finally {
    release();
    if (ownerTails.get(ownerId) === tail) {
      ownerTails.delete(ownerId);
      if (ownerTails.size === 0) drainTails.delete(storage);
    }
  }
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
  storage.set(
    ATTENDANCE_OUTBOX_KEY,
    JSON.stringify({ version: ATTENDANCE_OUTBOX_SCHEMA_VERSION, entries }),
  );
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
    drain: (
      send: (mark: AttendanceOutboxMark) => Promise<void>,
      now: Date = new Date(),
    ): Promise<AttendanceDrainResult> =>
      serializeDrain(storage, ownerId, async () => {
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
              ATTENDANCE_RETRY_BASE_MS * ATTENDANCE_RETRY_BACKOFF_BASE ** (nextAttemptCount - 1),
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
        let nextRetryAt: string | null = null;
        for (const entry of readEntries(storage)) {
          if (
            entry.ownerId === ownerId &&
            entry.retryAt !== null &&
            (nextRetryAt === null || entry.retryAt < nextRetryAt)
          ) {
            nextRetryAt = entry.retryAt;
          }
        }
        return { sent, failed, nextRetryAt };
      }),
  };
}
