import { expect, test } from 'bun:test';
import { canPromptForPush } from './push-prompt-eligibility';

const ready = { area: 'player' as const, pathname: '/', home: null, isBlocked: false };

test('permission explanation waits for the main home screen after onboarding', () => {
  expect(canPromptForPush(ready)).toBe(true);
  for (const area of ['onboarding', 'resolving', 'unresolved'] as const) {
    expect(canPromptForPush({ ...ready, area })).toBe(false);
  }
  for (const pathname of ['/onboarding', '/authorization', '/profile-edit', '/event/123']) {
    expect(canPromptForPush({ ...ready, pathname })).toBe(false);
  }
  expect(canPromptForPush({ ...ready, isBlocked: true })).toBe(false);
});

test('team and entity accounts wait for their own resolved home', () => {
  for (const [area, home] of [
    ['team', '/today'],
    ['entity', '/entity-home'],
  ] as const) {
    expect(canPromptForPush({ ...ready, area, home })).toBe(false);
    expect(canPromptForPush({ ...ready, area, home, pathname: home })).toBe(true);
    expect(canPromptForPush({ ...ready, area, home, pathname: home, isBlocked: true })).toBe(false);
  }
});
