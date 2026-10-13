/**
 * Which part of the app a signed-in person may use (RAPP-232), decided from her
 * account type, never from the absence of one.
 *
 *   player      the five player tabs
 *   team        the team screens her permissions open (staff and admins)
 *   entity      a partner-entity contact: the portal stays on the web for now
 *   onboarding  a player whose profile is not complete yet
 *   resolving   the first profile lookup after signing in is still running
 *   unresolved  the account could not be checked and nothing is remembered:
 *               a retry screen, never the player tabs
 *
 * The area and a team member's permissions are remembered per user on the
 * device, so an offline cold start still opens the right screens (attendance is
 * taken offline). That memory is a navigation hint only: every read and write
 * still crosses the database's permission checks.
 */
import type { PermissionCode } from '@ramassa/shared/permissions';
import { PERMISSION_CATALOG } from '@ramassa/shared/permissions';
import type { AppRole } from '@ramassa/shared/schemas';
import { teamAreas, teamLayout, teamStart } from './team-shell';

export type AccountArea = 'player' | 'team' | 'entity' | 'onboarding' | 'resolving' | 'unresolved';

type RememberedArea = Extract<AccountArea, 'player' | 'team' | 'entity'>;

export interface RememberedAccount {
  readonly area: RememberedArea;
  readonly permissions: ReadonlySet<PermissionCode>;
}

export interface AccountAreaStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

const ACCOUNT_AREA_CACHE_PREFIX = 'ramassa.account-area.v1';
const KNOWN_CODES = new Set<string>(PERMISSION_CATALOG.map(({ code }) => code));

const cacheKey = (userId: string) => `${ACCOUNT_AREA_CACHE_PREFIX}:${userId}`;

export function areaForRole(role: AppRole): RememberedArea {
  if (role === 'staff' || role === 'admin') return 'team';
  if (role === 'entity') return 'entity';
  return 'player';
}

export function resolveAccountArea(input: {
  readonly role: AppRole | null;
  readonly needsOnboarding: boolean;
  readonly isResolvingProfile?: boolean;
  readonly remembered: RememberedAccount | null;
}): AccountArea {
  if (input.needsOnboarding) return 'onboarding';
  if (input.role !== null) return areaForRole(input.role);
  if (input.remembered !== null) return input.remembered.area;
  return input.isResolvingProfile === true ? 'resolving' : 'unresolved';
}

export function rememberAccount(
  storage: AccountAreaStorage,
  userId: string,
  account: RememberedAccount,
): void {
  storage.set(
    cacheKey(userId),
    JSON.stringify({ area: account.area, permissions: [...account.permissions] }),
  );
}

export function readRememberedAccount(
  storage: AccountAreaStorage,
  userId: string,
): RememberedAccount | null {
  const raw = storage.getString(cacheKey(userId));
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as { area?: unknown; permissions?: unknown };
    if (parsed.area !== 'player' && parsed.area !== 'team' && parsed.area !== 'entity') {
      return null;
    }
    const permissions = Array.isArray(parsed.permissions)
      ? parsed.permissions.filter(
          (code): code is PermissionCode => typeof code === 'string' && KNOWN_CODES.has(code),
        )
      : [];
    return { area: parsed.area, permissions: new Set(permissions) };
  } catch {
    return null;
  }
}

export function forgetAccount(storage: AccountAreaStorage, userId: string): void {
  storage.remove(cacheKey(userId));
}

/** The team screens a set of permissions opens in this phase (RAPP-232). */
export function teamScreens(permissions: ReadonlySet<PermissionCode>): {
  readonly attendance: boolean;
  readonly participants: boolean;
  readonly messages: boolean;
  readonly stock: boolean;
  readonly arrivals: boolean;
  readonly counts: boolean;
  readonly checkouts: boolean;
} {
  return {
    attendance: permissions.has('attendance.mark') || permissions.has('attendance.reports'),
    participants: permissions.has('participants.view'),
    messages: permissions.has('messages.inbox'),
    stock: teamAreas(permissions).includes('stock'),
    arrivals: permissions.has('equipment.receive'),
    counts: permissions.has('equipment.count'),
    checkouts: permissions.has('equipment.receive') || permissions.has('equipment.count'),
  };
}

/**
 * Where an area starts. `/` is the player home; for any other area the layout
 * redirects there explicitly, because the router's own fallback for an
 * unavailable `/` picks a screen by its own order (RAPP-232). A team member's
 * start depends on the screen too: large buttons on a phone with one or two
 * areas, otherwise her first area (RAPP-245).
 */
export function areaHome(
  area: AccountArea,
  permissions: ReadonlySet<PermissionCode>,
  width: number,
):
  | '/home'
  | '/today'
  | '/participants'
  | '/messages'
  | '/more'
  | '/team-home'
  | '/entity-portal'
  | '/account-unresolved'
  | null {
  if (area === 'team') {
    const areas = teamAreas(permissions);
    return teamStart(areas, teamLayout({ areaCount: areas.length, width }));
  }
  if (area === 'entity') return '/entity-portal';
  if (area === 'unresolved') return '/account-unresolved';
  return null;
}
