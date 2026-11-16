import { expect, test } from 'bun:test';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { pendingQueues } from './today';

const codes = (...list: PermissionCode[]) => new Set<PermissionCode>(list);

test('late loans show for every team member: the database returns her own or, for the storeroom, all', () => {
  expect(pendingQueues(codes())).toEqual(['lateLoans']);
});

test('every queue in a fixed order, each with its own permission (RAPP-795)', () => {
  expect(
    pendingQueues(
      codes(
        'services.review',
        'knowledge.publish',
        'forum.moderate',
        'feedback.view',
        'mentoring.manage',
        'participants.view',
        'rgpd.erase',
        'messages.inbox',
        'equipment.count',
      ),
    ),
  ).toEqual([
    'serviceReviews',
    'stories',
    'reports',
    'feedback',
    'mentoring',
    'erasure',
    'messages',
    'lateLoans',
    'stockAlerts',
    'monthlyCount',
  ]);
});

test('no queue depends on an attendance permission', () => {
  expect(pendingQueues(codes('attendance.mark', 'attendance.reports'))).toEqual(['lateLoans']);
});

test('stories show for whoever edits or publishes the knowledge base', () => {
  expect(pendingQueues(codes('knowledge.edit'))).toContain('stories');
  expect(pendingQueues(codes('knowledge.publish'))).toContain('stories');
});

test('reported content shows for the forum or the gallery moderator', () => {
  expect(pendingQueues(codes('forum.moderate'))).toContain('reports');
  expect(pendingQueues(codes('gallery.moderate'))).toContain('reports');
});

test('erasure requests need the participants area, as their screen does', () => {
  expect(pendingQueues(codes('rgpd.erase'))).not.toContain('erasure');
  expect(pendingQueues(codes('rgpd.erase', 'participants.view'))).toContain('erasure');
});

test('stock below zero for whoever counts or hands out; the monthly count for whoever counts', () => {
  expect(pendingQueues(codes('equipment.handover'))).toEqual(['lateLoans', 'stockAlerts']);
  expect(pendingQueues(codes('equipment.count'))).toEqual([
    'lateLoans',
    'stockAlerts',
    'monthlyCount',
  ]);
  expect(pendingQueues(codes('equipment.receive'))).toEqual(['lateLoans']);
});
