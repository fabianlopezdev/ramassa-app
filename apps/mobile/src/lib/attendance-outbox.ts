import {
  nextAttendanceMarkedAt,
  nextAttendanceStatus,
  type AttendanceStatus,
} from '@ramassa/shared/attendance';
import {
  createOutbox,
  type OutboxConfig,
  type OutboxEntry,
  type OutboxStorage,
} from '@ramassa/shared/offline';

const ATTENDANCE_OUTBOX_KEY = 'ramassa.attendance-outbox.v1';
const ATTENDANCE_OUTBOX_SCHEMA_VERSION = 1;

export type AttendanceOutboxStorage = OutboxStorage;

export interface AttendanceOutboxMark extends OutboxEntry {
  readonly occurrenceId: string;
  readonly playerId: string;
  readonly status: AttendanceStatus;
  readonly markedAt: string;
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
  readonly rejected: number;
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

function isAttendanceOutboxMark(value: unknown): value is AttendanceOutboxMark {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.ownerId === 'string' &&
    typeof entry.occurrenceId === 'string' &&
    typeof entry.playerId === 'string' &&
    typeof entry.status === 'string' &&
    typeof entry.markedAt === 'string' &&
    typeof entry.attemptCount === 'number' &&
    (entry.retryAt === null || typeof entry.retryAt === 'string')
  );
}

const ATTENDANCE_OUTBOX: OutboxConfig<AttendanceOutboxMark> = {
  key: ATTENDANCE_OUTBOX_KEY,
  version: ATTENDANCE_OUTBOX_SCHEMA_VERSION,
  isEntry: isAttendanceOutboxMark,
  compare: (left, right) => left.markedAt.localeCompare(right.markedAt),
  isSameVersion: (left, right) => left.id === right.id && left.markedAt === right.markedAt,
  mode: 'independent',
};

/**
 * Attendance on the shared outbox (RAPP-237). The idempotency key is one per
 * person per session (`owner:occurrence:player`): a new tap replaces the
 * pending one, and the server keeps the mark with the latest `marked_at`, so a
 * repeated send changes nothing.
 */
export function createAttendanceOutbox(storage: AttendanceOutboxStorage, ownerId: string) {
  const outbox = createOutbox(storage, ownerId, ATTENDANCE_OUTBOX);
  return {
    list: outbox.list,
    retry: outbox.retry,
    discard: outbox.discard,
    enqueue: (input: EnqueueAttendanceMark): AttendanceOutboxMark =>
      outbox.enqueue({
        id: `${ownerId}:${input.occurrenceId}:${input.playerId}`,
        occurrenceId: input.occurrenceId,
        playerId: input.playerId,
        status: input.status,
        markedAt: input.markedAt,
      }),
    drain: async (
      send: (mark: AttendanceOutboxMark) => Promise<void>,
      now: Date = new Date(),
    ): Promise<AttendanceDrainResult> => {
      const result = await outbox.drain(send, now);
      return {
        sent: result.sent,
        failed: result.failed,
        rejected: result.rejected,
        nextRetryAt: result.nextRetryAt,
      };
    },
  };
}
