import { expect, test } from 'bun:test';
import { playerMentoringQueryKey } from './player-mentoring-key';

test('private mentoring cache keys are isolated by signed-in player', () => {
  expect(playerMentoringQueryKey('player-a')).toEqual(['player-mentoring', 'player-a']);
  expect(playerMentoringQueryKey('player-a')).not.toEqual(playerMentoringQueryKey('player-b'));
});
