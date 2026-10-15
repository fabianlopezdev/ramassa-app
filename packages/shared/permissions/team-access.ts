/**
 * Reading and changing team access (RAPP-231): who holds which permission, the
 * presets, and the actions the Team screen offers. Every write is a database
 * function that enforces the safety rules itself (RAPP-229): team.manage is
 * required, nobody changes a toggle they do not hold, and the organization keeps
 * a team.manage holder. The screen only shows the rules; it does not own them.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import type { Database } from '../types/database';
import {
  BUILTIN_PRESET_KEYS,
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
  type BuiltinPresetKey,
  type PermissionArea,
  type PermissionCode,
} from './catalog';

type Client = SupabaseClient<Database>;

const permissionCodeSchema = z.enum(
  PERMISSION_CATALOG.map(({ code }) => code) as [PermissionCode, ...PermissionCode[]],
);

function databaseFailure(message: string): never {
  throw new AppError(databaseErrorCode(message), { message });
}

export interface PermissionPreset {
  readonly id: string;
  /** Set for the three built-in presets; their name is translated unless renamed. */
  readonly builtinKey: BuiltinPresetKey | null;
  readonly name: string | null;
  readonly permissions: ReadonlySet<PermissionCode>;
}

export interface TeamMemberAccess {
  readonly profileId: string;
  readonly presetId: string | null;
  readonly permissions: ReadonlySet<PermissionCode>;
}

/** The signed-in person's own permissions, for menus and route guards. */
export async function fetchMyPermissions(client: Client): Promise<ReadonlySet<PermissionCode>> {
  const { data, error } = await client.rpc('my_permissions');
  if (error) databaseFailure(error.message);
  return new Set(z.array(permissionCodeSchema).parse(data ?? []));
}

const presetRowSchema = z.object({
  id: z.uuid(),
  builtin_key: z.enum(BUILTIN_PRESET_KEYS).nullable(),
  name: z.string().nullable(),
});
const presetPermissionRowSchema = z.object({
  preset_id: z.uuid(),
  permission_code: permissionCodeSchema,
});
const accessRowSchema = z.object({ profile_id: z.uuid(), preset_id: z.uuid().nullable() });
const grantRowSchema = z.object({ profile_id: z.uuid(), permission_code: permissionCodeSchema });

const BUILTIN_ORDER: Record<BuiltinPresetKey, number> = { coach: 0, staff: 1, admin: 2 };

/**
 * Every preset and every team member's toggles in the caller's organization.
 * Readable only with team.manage (row policies); anyone else gets empty lists.
 */
export async function fetchTeamAccess(client: Client): Promise<{
  readonly presets: readonly PermissionPreset[];
  readonly members: readonly TeamMemberAccess[];
}> {
  const [presets, presetPermissions, access, grants] = await Promise.all([
    client.from('permission_presets').select('id, builtin_key, name'),
    client.from('permission_preset_permissions').select('preset_id, permission_code'),
    client.from('team_member_access').select('profile_id, preset_id'),
    client.from('team_member_permissions').select('profile_id, permission_code'),
  ]);
  for (const result of [presets, presetPermissions, access, grants]) {
    if (result.error) databaseFailure(result.error.message);
  }

  const codesByPreset = groupCodes(
    z.array(presetPermissionRowSchema).parse(presetPermissions.data ?? []),
    (row) => row.preset_id,
  );
  const codesByMember = groupCodes(
    z.array(grantRowSchema).parse(grants.data ?? []),
    (row) => row.profile_id,
  );
  const presetByMember = new Map(
    z
      .array(accessRowSchema)
      .parse(access.data ?? [])
      .map((row) => [row.profile_id, row.preset_id]),
  );

  const parsedPresets = z
    .array(presetRowSchema)
    .parse(presets.data ?? [])
    .map((row) => ({
      id: row.id,
      builtinKey: row.builtin_key,
      name: row.name,
      permissions: codesByPreset.get(row.id) ?? new Set<PermissionCode>(),
    }))
    .sort((a, b) => {
      // Built-ins first, in the order Coach, Staff, Admin; then by name.
      if (a.builtinKey !== null || b.builtinKey !== null) {
        if (a.builtinKey === null) return 1;
        if (b.builtinKey === null) return -1;
        return BUILTIN_ORDER[a.builtinKey] - BUILTIN_ORDER[b.builtinKey];
      }
      return (a.name ?? '').localeCompare(b.name ?? '', 'ca');
    });

  const memberIds = new Set([...codesByMember.keys(), ...presetByMember.keys()]);
  const members = [...memberIds].map((profileId) => ({
    profileId,
    presetId: presetByMember.get(profileId) ?? null,
    permissions: codesByMember.get(profileId) ?? new Set<PermissionCode>(),
  }));

  return { presets: parsedPresets, members };
}

function groupCodes<T extends { permission_code: PermissionCode }>(
  rows: readonly T[],
  key: (row: T) => string,
): Map<string, Set<PermissionCode>> {
  const grouped = new Map<string, Set<PermissionCode>>();
  for (const row of rows) {
    const codes = grouped.get(key(row)) ?? new Set<PermissionCode>();
    codes.add(row.permission_code);
    grouped.set(key(row), codes);
  }
  return grouped;
}

export async function setTeamMemberPermissions(
  client: Client,
  input: {
    readonly profileId: string;
    readonly permissions: ReadonlySet<PermissionCode>;
    readonly presetId: string | null;
  },
): Promise<void> {
  const { error } = await client.rpc('set_team_member_permissions', {
    p_profile_id: z.uuid().parse(input.profileId),
    p_permission_codes: [...input.permissions],
    ...(input.presetId === null ? {} : { p_preset_id: z.uuid().parse(input.presetId) }),
  });
  if (error) databaseFailure(error.message);
}

/** Copies a preset's toggles to each person; returns how many were changed. */
export async function applyPermissionPreset(
  client: Client,
  presetId: string,
  profileIds: readonly string[],
): Promise<number> {
  const { data, error } = await client.rpc('apply_permission_preset', {
    p_preset_id: z.uuid().parse(presetId),
    p_profile_ids: profileIds.map((id) => z.uuid().parse(id)),
  });
  if (error) databaseFailure(error.message);
  return z.number().parse(data);
}

/** Creates a preset (`presetId` null) or edits one. Returns its id. */
export async function savePermissionPreset(
  client: Client,
  input: {
    readonly presetId: string | null;
    readonly name: string | null;
    readonly permissions: ReadonlySet<PermissionCode>;
  },
): Promise<string> {
  const { data, error } = await client.rpc('save_permission_preset', {
    // The database treats a null id as "create" and a null name as "keep the
    // built-in's translated name"; the generated types do not model nullable
    // arguments, so they are passed as the SQL nulls they are.
    p_preset_id: (input.presetId === null ? null : z.uuid().parse(input.presetId)) as string,
    p_name: input.name as string,
    p_permission_codes: [...input.permissions],
  });
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function deletePermissionPreset(client: Client, presetId: string): Promise<void> {
  const { error } = await client.rpc('delete_permission_preset', {
    p_preset_id: z.uuid().parse(presetId),
  });
  if (error) databaseFailure(error.message);
}

export async function restorePermissionPresetDefault(
  client: Client,
  presetId: string,
): Promise<void> {
  const { error } = await client.rpc('restore_permission_preset_default', {
    p_preset_id: z.uuid().parse(presetId),
  });
  if (error) databaseFailure(error.message);
}

// Pure helpers the screen renders from ---------------------------------------------------

/** The catalog grouped by area, in catalog order, for the toggle list. */
export function permissionsByArea(): readonly {
  readonly area: PermissionArea;
  readonly codes: readonly PermissionCode[];
}[] {
  return PERMISSION_AREAS.map((area) => ({
    area,
    codes: PERMISSION_CATALOG.filter((permission) => permission.area === area).map(
      ({ code }) => code,
    ),
  }));
}

export type AccessSummary =
  | { readonly kind: 'preset'; readonly preset: PermissionPreset; readonly adjusted: boolean }
  | { readonly kind: 'custom' };

/** "Coach", "Coach, adjusted" or "Custom": the preset last applied, compared with today's toggles. */
export function summarizeAccess(
  member: TeamMemberAccess,
  presets: readonly PermissionPreset[],
): AccessSummary {
  const preset = presets.find((candidate) => candidate.id === member.presetId);
  if (preset === undefined) return { kind: 'custom' };
  return { kind: 'preset', preset, adjusted: !sameCodes(member.permissions, preset.permissions) };
}

export function sameCodes(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((code) => b.has(code));
}

/** The people whose last applied preset is this one ("Apply to the N people who use it?"). */
export function membersUsingPreset(
  presetId: string,
  members: readonly TeamMemberAccess[],
): readonly TeamMemberAccess[] {
  return members.filter((member) => member.presetId === presetId);
}

/**
 * The database refuses a team change with a stable code in its message; each
 * gets its own sentence in the `settings` namespace (RAPP-231). Shared by the
 * web admin and the phone (RAPP-404).
 */
export function teamAccessErrorKey(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  if (text.includes('PERMISSIONS/LAST_TEAM_MANAGER') || text.includes('team.manage holder')) {
    return 'team.errorLastManager';
  }
  if (text.includes('PERMISSIONS/NOT_HELD')) return 'team.errorNotHeld';
  if (text.includes('PERMISSIONS/BUILTIN_PRESET')) return 'team.errorBuiltIn';
  if (text.includes('PERMISSIONS/PRESET_NAME_REQUIRED')) return 'team.errorPresetName';
  return 'actionError';
}
