/**
 * Her health answer on her page (RAPP-614, pending fix 25): once she
 * withdraws the health data consent the answer is deleted, and her page says
 * the consent was withdrawn rather than "not provided".
 */
import { expect, test } from 'bun:test';
import type { ParticipantConsent } from '@ramassa/shared/authorization';
import { healthAnswerState } from './participant-authorization-panel';

const consent = (granted: boolean): ParticipantConsent => ({
  key: 'health_data',
  granted,
  decidedAt: '2026-10-22T10:00:00Z',
  method: 'profile',
  wording: null,
  language: null,
  required: false,
  seasonName: null,
  versionNumber: null,
});

test('an answer shows; a withdrawn consent says so; otherwise nothing was given', () => {
  expect(healthAnswerState('Asma', [consent(true)])).toBe('answer');
  expect(healthAnswerState(null, [consent(false)])).toBe('withdrawn');
  expect(healthAnswerState(null, [consent(true)])).toBe('none');
  expect(healthAnswerState(null, [])).toBe('none');
});
