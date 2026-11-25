/**
 * Avui's "Pendent" list (RAPP-246, RAPP-795): one compact row per queue that
 * waits for the team, in a fixed order. Each row depends on its own
 * permission and never on an attendance permission, so a team member without
 * attendance still gets the list. Late loans have no permission of their own:
 * the database returns the storeroom every late loan and anyone else her own.
 */
import type { PermissionCode } from '@ramassa/shared/permissions';

export type PendingQueue =
  | 'serviceReviews'
  | 'stories'
  | 'reports'
  | 'feedback'
  | 'mentoring'
  | 'incidents'
  | 'erasure'
  | 'messages'
  | 'lateLoans'
  | 'stockAlerts'
  | 'monthlyCount';

/** `null`: every team member, the database decides which rows she sees. */
type QueueRule = readonly (readonly PermissionCode[])[] | null;

const holds = (permissions: ReadonlySet<PermissionCode>, rule: QueueRule) =>
  rule === null ||
  // Every group must match; within a group, any code does.
  rule.every((anyOf) => anyOf.some((code) => permissions.has(code)));

const PENDING_QUEUE_RULES: readonly {
  readonly queue: PendingQueue;
  readonly rule: QueueRule;
}[] = [
  { queue: 'serviceReviews', rule: [['services.review']] },
  { queue: 'stories', rule: [['knowledge.edit', 'knowledge.publish']] },
  { queue: 'reports', rule: [['forum.moderate', 'gallery.moderate']] },
  { queue: 'feedback', rule: [['feedback.view']] },
  { queue: 'mentoring', rule: [['mentoring.manage']] },
  // The incidents players report (RAPP-973), beside mentoring.
  { queue: 'incidents', rule: [['incidents.manage']] },
  // The requests screen sits inside Participants, so it needs that area too.
  { queue: 'erasure', rule: [['rgpd.erase'], ['participants.view']] },
  { queue: 'messages', rule: [['messages.inbox']] },
  { queue: 'lateLoans', rule: null },
  { queue: 'stockAlerts', rule: [['equipment.count', 'equipment.handover']] },
  { queue: 'monthlyCount', rule: [['equipment.count']] },
];

export function pendingQueues(permissions: ReadonlySet<PermissionCode>): readonly PendingQueue[] {
  return PENDING_QUEUE_RULES.filter(({ rule }) => holds(permissions, rule)).map(
    ({ queue }) => queue,
  );
}

/** Whether any queue is opened by a permission she holds (late loans are not). */
export function hasPermittedQueue(permissions: ReadonlySet<PermissionCode>): boolean {
  return PENDING_QUEUE_RULES.some(({ rule }) => rule !== null && holds(permissions, rule));
}
