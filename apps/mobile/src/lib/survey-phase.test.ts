import { expect, test } from 'bun:test';
import { surveyPhase } from './survey-phase';

const now = new Date('2026-10-15T10:00:00Z');

test('a survey is scheduled before publication, open until it closes, then closed', () => {
  expect(surveyPhase('2026-10-16T10:00:00Z', null, now)).toBe('scheduled');
  expect(surveyPhase('2026-10-14T10:00:00Z', null, now)).toBe('open');
  expect(surveyPhase('2026-10-14T10:00:00Z', '2026-10-15T10:00:01Z', now)).toBe('open');
  expect(surveyPhase('2026-10-14T10:00:00Z', '2026-10-15T10:00:00Z', now)).toBe('closed');
});
