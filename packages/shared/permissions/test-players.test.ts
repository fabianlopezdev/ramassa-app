import { describe, expect, test } from 'bun:test';
import type { PermissionCode } from './catalog';
import {
  canDeleteTestPlayer,
  canDesignOnboarding,
  isLimitedToTestPlayers,
  testPlayerOption,
} from './test-players';

const held = (...codes: PermissionCode[]) => new Set<PermissionCode>(codes);

describe('the onboarding design role (RAPP-615)', () => {
  test('only the design pair, alone, limits a person to test players', () => {
    expect(isLimitedToTestPlayers(held('onboarding.design', 'test_players.manage'))).toBe(true);
    expect(isLimitedToTestPlayers(held('test_players.manage'))).toBe(true);
    expect(isLimitedToTestPlayers(held('onboarding.design'))).toBe(true);
    // Any other job keeps the access that job always had.
    expect(isLimitedToTestPlayers(held('test_players.manage', 'participants.view'))).toBe(false);
    expect(isLimitedToTestPlayers(held('onboarding.design', 'equipment.handover'))).toBe(false);
    // Holding nothing is not the design role.
    expect(isLimitedToTestPlayers(held())).toBe(false);
  });

  test('Settings or the design role edit the onboarding', () => {
    expect(canDesignOnboarding(held('settings.organization'))).toBe(true);
    expect(canDesignOnboarding(held('onboarding.design'))).toBe(true);
    expect(canDesignOnboarding(held('settings.branding', 'test_players.manage'))).toBe(false);
  });

  test('the test player option is forced on for whoever creates test players only', () => {
    expect(testPlayerOption(held('test_players.manage'))).toBe('forced');
    expect(testPlayerOption(held('participants.invite'))).toBe('optional');
    expect(testPlayerOption(held('participants.invite', 'test_players.manage'))).toBe('optional');
    expect(testPlayerOption(held('participants.view'))).toBe('hidden');
  });

  test('a test player is deleted with test_players.manage or rgpd.erase', () => {
    expect(canDeleteTestPlayer(held('test_players.manage'))).toBe(true);
    expect(canDeleteTestPlayer(held('rgpd.erase'))).toBe(true);
    expect(canDeleteTestPlayer(held('participants.invite', 'participants.view'))).toBe(false);
  });
});
