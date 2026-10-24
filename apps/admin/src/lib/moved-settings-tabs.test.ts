import { expect, test } from 'bun:test';
import { movedSettingsTab } from './moved-settings-tabs';

const ENTITY_ID = '5eed0000-0000-4000-8000-000000000654';

test('the Settings tabs that became pages forward to them (RAPP-654)', () => {
  expect(movedSettingsTab('/settings', { tab: 'profile-layout' })).toEqual({
    to: '/profile-layout',
  });
  // The old question builder's tab opens the Fitxa (RAPP-656).
  expect(movedSettingsTab('/settings', { tab: 'questions' })).toEqual({ to: '/profile-layout' });
  expect(movedSettingsTab('/settings/', { tab: 'referral-form' })).toEqual({
    to: '/entities/referral-form',
  });
  expect(movedSettingsTab('/settings', { tab: 'staff' })).toEqual({ to: '/team' });
  expect(movedSettingsTab('/settings', { tab: 'entities', entity: ENTITY_ID })).toEqual({
    to: '/entities',
    search: { entity: ENTITY_ID },
  });
  expect(movedSettingsTab('/settings', { tab: 'entities' })).toEqual({
    to: '/entities',
    search: {},
  });
});

test('the tabs that stay in Settings, and every other URL, are left alone', () => {
  for (const tab of [undefined, 'organization', 'authorization', 'documents']) {
    expect(movedSettingsTab('/settings', { tab })).toBeNull();
  }
  expect(movedSettingsTab('/participants', { tab: 'staff' })).toBeNull();
  expect(movedSettingsTab('/settings/elsewhere', { tab: 'staff' })).toBeNull();
});
