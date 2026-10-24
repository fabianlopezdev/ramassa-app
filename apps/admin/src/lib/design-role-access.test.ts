import { describe, expect, test } from 'bun:test';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { designRoleLanding, designRoleRedirect } from './design-role-access';

const held = (...codes: PermissionCode[]) => new Set<PermissionCode>(codes);
const DESIGN = held('onboarding.design', 'test_players.manage');
const PLAYER_ID = '5eed0000-0000-4000-8000-000000000096';

describe('the onboarding design role reaches its two areas only (RAPP-615)', () => {
  test('the onboarding settings and the test players stay open', () => {
    for (const path of [
      '/onboarding',
      '/participants',
      '/participants/',
      '/participants/new',
      `/participants/${PLAYER_ID}`,
      '/account',
      // Dades de les jugadores (RAPP-650, its own page since RAPP-654).
      '/profile-layout',
    ]) {
      expect(designRoleRedirect(path, DESIGN)).toBeNull();
    }
  });

  test('every other admin URL goes back to the onboarding', () => {
    for (const path of [
      '/dashboard',
      // Settings is no longer hers (RAPP-654).
      '/settings',
      '/settings/elsewhere',
      '/profile-layout/elsewhere',
      '/entities/referral-form',
      '/team',
      '/data',
      '/content',
      '/messages',
      '/participants/invites',
      '/participants/referrals',
      '/participants/deletion-requests',
      '/participants/season',
      '/participants/walk-ins',
      '/photo-handoff/abc',
      '/somewhere-new',
    ]) {
      expect(designRoleRedirect(path, DESIGN)).toBe('/onboarding');
    }
  });

  test('each half of the pair opens only its own area', () => {
    const testPlayersOnly = held('test_players.manage');
    expect(designRoleRedirect('/onboarding', testPlayersOnly)).toBe('/participants');
    expect(designRoleRedirect('/profile-layout', testPlayersOnly)).toBe('/participants');
    expect(designRoleRedirect('/participants/new', testPlayersOnly)).toBeNull();
    const onboardingOnly = held('onboarding.design');
    expect(designRoleRedirect('/participants', onboardingOnly)).toBe('/onboarding');
    expect(designRoleRedirect('/onboarding', onboardingOnly)).toBeNull();
  });

  test('anyone with another job keeps the admin as it was', () => {
    expect(
      designRoleRedirect('/dashboard', held('onboarding.design', 'participants.view')),
    ).toBeNull();
    expect(designRoleRedirect('/settings', held('settings.organization'))).toBeNull();
    expect(designRoleRedirect('/dashboard', held())).toBeNull();
  });

  test('the landing is the onboarding, or the test players without it', () => {
    expect(designRoleLanding(DESIGN)).toBe('/onboarding');
    expect(designRoleLanding(held('test_players.manage'))).toBe('/participants');
  });
});
