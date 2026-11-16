import { expect, test } from 'bun:test';
import type { PendingCustomForm } from '@ramassa/shared/intake-builder';
import type { PlayerSurvey } from '@ramassa/shared/surveys';
import { buildHomeToDoQueue } from './home-to-do';

function form(responseId: string): PendingCustomForm {
  return {
    responseId,
    formId: `form-${responseId}`,
    version: 1,
    name: { ca: responseId },
    mandatory: 'optional',
    deadline: null,
    isBlocking: false,
    kind: 'other',
  } as PendingCustomForm;
}

function survey(
  id: string,
  responseStatus: PlayerSurvey['responseStatus'],
  eventId: string | null = null,
): PlayerSurvey {
  return {
    id,
    title: { ca: id },
    eventId,
    publishedAt: '2026-11-01T10:00:00Z',
    closesAt: null,
    questions: [],
    responseStatus,
    completedAt: null,
  } as unknown as PlayerSurvey;
}

test('nothing pending gives an empty queue', () => {
  expect(buildHomeToDoQueue(undefined, undefined)).toEqual([]);
  expect(buildHomeToDoQueue([], [survey('done', 'completed')])).toEqual([]);
});

test('forms come first in server order, then every survey she has not completed', () => {
  const queue = buildHomeToDoQueue(
    [form('a'), form('b')],
    [survey('s1', null), survey('s2', 'completed'), survey('s3', 'in_progress')],
  );
  expect(queue.map((item) => item.key)).toEqual(['form:a', 'form:b', 'survey:s1', 'survey:s3']);
});

test('a survey that belongs to an activity, ended or not, waits in the queue', () => {
  const queue = buildHomeToDoQueue([], [survey('after-training', null, 'event-1')]);
  expect(queue).toHaveLength(1);
  expect(queue[0]).toMatchObject({ kind: 'survey', key: 'survey:after-training' });
});
