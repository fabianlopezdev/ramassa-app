import { describe, expect, test } from 'bun:test';
import { BUILTIN_PRESET_DEFAULTS, PERMISSION_CATALOG, type PermissionCode } from './catalog';
import {
  fetchTeamAccess,
  membersUsingPreset,
  permissionsByArea,
  summarizeAccess,
  teamAccessErrorKey,
  type PermissionPreset,
  type TeamMemberAccess,
} from './team-access';

const coach: PermissionPreset = {
  id: '29000000-0000-4000-8000-000000000001',
  builtinKey: 'coach',
  name: null,
  permissions: new Set(BUILTIN_PRESET_DEFAULTS.coach),
};

const member = (presetId: string | null, codes: readonly PermissionCode[]): TeamMemberAccess => ({
  profileId: '5eed0000-0000-4000-8000-000000000002',
  presetId,
  permissions: new Set(codes),
});

describe('summarizeAccess', () => {
  test('toggles equal to the preset read as the preset', () => {
    expect(summarizeAccess(member(coach.id, BUILTIN_PRESET_DEFAULTS.coach), [coach])).toEqual({
      kind: 'preset',
      preset: coach,
      adjusted: false,
    });
  });

  test('one toggle more reads as adjusted', () => {
    const summary = summarizeAccess(
      member(coach.id, [...BUILTIN_PRESET_DEFAULTS.coach, 'feedback.view']),
      [coach],
    );
    expect(summary).toMatchObject({ kind: 'preset', adjusted: true });
  });

  test('one toggle fewer reads as adjusted too', () => {
    const summary = summarizeAccess(member(coach.id, ['participants.view']), [coach]);
    expect(summary).toMatchObject({ kind: 'preset', adjusted: true });
  });

  test('no preset, or a deleted one, reads as custom', () => {
    expect(summarizeAccess(member(null, []), [coach])).toEqual({ kind: 'custom' });
    expect(summarizeAccess(member('29000000-0000-4000-8000-0000000000ff', []), [coach])).toEqual({
      kind: 'custom',
    });
  });
});

test('membersUsingPreset finds the people whose last applied preset it is', () => {
  const users = membersUsingPreset(coach.id, [member(coach.id, []), member(null, [])]);
  expect(users).toHaveLength(1);
});

test('permissionsByArea lists every permission once, in catalog order', () => {
  const codes = permissionsByArea().flatMap((group) => group.codes);
  expect(codes).toEqual(PERMISSION_CATALOG.map(({ code }) => code));
});

describe('fetchTeamAccess', () => {
  function clientWith(tables: Record<string, unknown[]>) {
    return {
      from: (table: string) => ({
        select: async () => ({ data: tables[table] ?? [], error: null }),
      }),
    } as never;
  }

  test("joins presets, their permissions, and each member's toggles", async () => {
    const result = await fetchTeamAccess(
      clientWith({
        permission_presets: [
          { id: '29000000-0000-4000-8000-000000000009', builtin_key: null, name: 'Material' },
          { id: coach.id, builtin_key: 'coach', name: null },
        ],
        permission_preset_permissions: [
          { preset_id: coach.id, permission_code: 'attendance.mark' },
        ],
        team_member_access: [
          { profile_id: '5eed0000-0000-4000-8000-000000000002', preset_id: coach.id },
        ],
        team_member_permissions: [
          {
            profile_id: '5eed0000-0000-4000-8000-000000000002',
            permission_code: 'attendance.mark',
          },
          { profile_id: '5eed0000-0000-4000-8000-000000000002', permission_code: 'feedback.view' },
        ],
      }),
    );
    expect(result.presets.map((preset) => preset.builtinKey ?? preset.name)).toEqual([
      'coach',
      'Material',
    ]);
    expect([...result.presets[0]!.permissions]).toEqual(['attendance.mark']);
    expect(result.members).toHaveLength(1);
    expect([...result.members[0]!.permissions].sort()).toEqual([
      'attendance.mark',
      'feedback.view',
    ]);
    expect(result.members[0]!.presetId).toBe(coach.id);
  });

  test('a database error becomes DB-1', async () => {
    const client = {
      from: () => ({ select: async () => ({ data: null, error: { message: 'denied' } }) }),
    } as never;
    await expect(fetchTeamAccess(client)).rejects.toMatchObject({ code: 'DB-1' });
  });
});

test('each refusal from the database gets its own sentence', () => {
  expect(teamAccessErrorKey(new Error('PERMISSIONS/LAST_TEAM_MANAGER'))).toBe(
    'team.errorLastManager',
  );
  expect(teamAccessErrorKey(new Error('at least one team.manage holder'))).toBe(
    'team.errorLastManager',
  );
  expect(teamAccessErrorKey(new Error('PERMISSIONS/NOT_HELD'))).toBe('team.errorNotHeld');
  expect(teamAccessErrorKey(new Error('PERMISSIONS/BUILTIN_PRESET'))).toBe('team.errorBuiltIn');
  expect(teamAccessErrorKey(new Error('PERMISSIONS/PRESET_NAME_REQUIRED'))).toBe(
    'team.errorPresetName',
  );
  expect(teamAccessErrorKey('something else')).toBe('actionError');
});
