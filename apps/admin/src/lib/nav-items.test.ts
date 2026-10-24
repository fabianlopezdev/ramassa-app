import { expect, test } from 'bun:test';
import {
  createI18n,
  createInMemoryLanguageStorage,
  SUPPORTED_LANGUAGES,
} from '@ramassa/shared/i18n';
import type { PermissionCode } from '@ramassa/shared/permissions';
import {
  activeStaffNavPath,
  ENTITY_NAV_ITEMS,
  holdsAnyPermission,
  STAFF_NAV_GROUPS,
  STAFF_NAV_ITEMS,
  visibleStaffNavGroups,
  visibleStaffNavItems,
} from './nav-items';

const ALL_ITEMS = [...STAFF_NAV_ITEMS, ...ENTITY_NAV_ITEMS];

test('no admin route is claimed by two areas at once', () => {
  // Regression guard: `_staff` and `_entity` are PATHLESS layouts, so before the
  // entity area was namespaced under /portal, `_staff.messages` and
  // `_entity.messages` both resolved to `/messages` and collided in the route
  // tree. Any future same-named section would silently do it again.
  const staffPaths = new Set<string>(STAFF_NAV_ITEMS.map((item) => item.to));
  const overlap = ENTITY_NAV_ITEMS.filter((item) => staffPaths.has(item.to));
  expect(overlap).toEqual([]);
});

test('every nav destination is unique', () => {
  const paths = ALL_ITEMS.map((item) => item.to);
  expect(new Set(paths).size).toBe(paths.length);
});

test('staff can reach the forum moderation queue from primary navigation', () => {
  expect(STAFF_NAV_ITEMS.some((item) => item.to === '/forum')).toBe(true);
});

test('staff can reach the mentoring queue from primary navigation', () => {
  expect(STAFF_NAV_ITEMS.some((item) => item.to === '/mentoring')).toBe(true);
});

test('staff can reach the feedback inbox from primary navigation', () => {
  expect(STAFF_NAV_ITEMS.some((item) => item.to === '/feedback')).toBe(true);
});

test('staff can reach targeted notifications from primary navigation', () => {
  expect(STAFF_NAV_ITEMS.some((item) => item.to === '/notifications')).toBe(true);
});

test('staff can reach surveys from primary navigation', () => {
  expect(STAFF_NAV_ITEMS.some((item) => item.to === '/surveys')).toBe(true);
});

test('the entity area stays namespaced under /portal', () => {
  for (const item of ENTITY_NAV_ITEMS) {
    expect(item.to === '/portal' || item.to.startsWith('/portal/')).toBe(true);
  }
});

test('every nav item ships an icon AND a label key (SPEC: never icon-only)', () => {
  for (const item of ALL_ITEMS) {
    expect(item.icon).toBeDefined();
    expect(item.labelKey.length).toBeGreaterThan(0);
  }
});

test.each(SUPPORTED_LANGUAGES.map((language) => [language] as const))(
  'every nav item label the shells actually render resolves in %s',
  (language) => {
    const i18n = createI18n({ languageStorage: createInMemoryLanguageStorage() });
    const translate = i18n.getFixedT(language);
    for (const item of ALL_ITEMS) {
      const label = translate(item.labelKey);
      // A missing key echoes the key back, which would ship a menu item reading
      // "nav:staff.content" to a user.
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(item.labelKey);
      expect(label).not.toBe(item.labelKey.replace(/^nav:/, ''));
    }
  },
);

test('the menu shows an item to a holder of any of its permissions, and the dashboard to everyone', () => {
  const coach = new Set(['attendance.mark', 'messages.inbox'] as const);
  const visible = STAFF_NAV_ITEMS.filter((item) =>
    holdsAnyPermission(coach, 'anyPermission' in item ? item.anyPermission : undefined),
  ).map((item) => item.to);
  expect(visible).toEqual(['/dashboard', '/attendance', '/messages']);
});

test('gallery moderators reach the gallery from primary navigation', () => {
  const gallery = STAFF_NAV_ITEMS.find((item) => item.to === '/gallery');
  expect(gallery).toBeDefined();
  expect(holdsAnyPermission(new Set(['gallery.moderate']), gallery?.anyPermission)).toBe(true);
  expect(holdsAnyPermission(new Set(['forum.moderate']), gallery?.anyPermission)).toBe(false);
});

test('the onboarding design role sees the test players, the onboarding and the Fitxa (RAPP-615, RAPP-654)', () => {
  const design = new Set<PermissionCode>(['onboarding.design', 'test_players.manage']);
  expect(visibleStaffNavItems(design).map((item) => item.to)).toEqual([
    '/participants',
    '/onboarding',
    '/profile-layout',
  ]);
});

test('Settings holds the organization tabs only; the team, entities and Fitxa have their own items', () => {
  const settings = new Set<PermissionCode>(['settings.organization']);
  expect(visibleStaffNavItems(settings).map((item) => item.to)).toEqual([
    '/dashboard',
    '/onboarding',
    '/entities/referral-form',
    '/profile-layout',
    '/settings',
  ]);
  expect(
    visibleStaffNavItems(new Set<PermissionCode>(['team.manage'])).map((item) => item.to),
  ).toEqual(['/dashboard', '/profile-layout', '/team']);
  const coach = new Set<PermissionCode>(['participants.view', 'attendance.mark']);
  expect(visibleStaffNavItems(coach).map((item) => item.to)).toEqual([
    '/dashboard',
    '/participants',
    '/attendance',
  ]);
});

test('the menu groups by audience in the agreed order (RAPP-654)', () => {
  const byGroup = Object.fromEntries(
    STAFF_NAV_GROUPS.map((group) => [
      group.id,
      STAFF_NAV_ITEMS.filter((item) => item.group === group.id).map((item) => item.to),
    ]),
  );
  expect(byGroup).toEqual({
    top: ['/dashboard', '/participants'],
    app: [
      '/onboarding',
      '/content',
      '/attendance',
      '/messages',
      '/forum',
      '/gallery',
      '/mentoring',
      '/feedback',
      '/surveys',
      '/notifications',
    ],
    entities: ['/participants/referrals', '/entities/referral-form', '/entities'],
    organisation: ['/profile-layout', '/team', '/participants/season', '/data', '/settings'],
  });
});

test('a group with nothing she may open is left out', () => {
  const coach = new Set<PermissionCode>(['participants.view', 'attendance.mark']);
  expect(visibleStaffNavGroups(coach).map((group) => group.id)).toEqual(['top', 'app']);
  const referrals = new Set<PermissionCode>(['referrals.manage']);
  expect(
    visibleStaffNavGroups(referrals).map((group) => [group.id, group.items.map((item) => item.to)]),
  ).toEqual([
    ['top', ['/dashboard', '/participants']],
    ['entities', ['/participants/referrals']],
  ]);
});

test('only the deepest item the path sits in is marked as the current page', () => {
  expect(activeStaffNavPath('/participants/referrals', STAFF_NAV_ITEMS)).toBe(
    '/participants/referrals',
  );
  expect(activeStaffNavPath('/participants/season', STAFF_NAV_ITEMS)).toBe('/participants/season');
  expect(activeStaffNavPath('/participants/invites', STAFF_NAV_ITEMS)).toBe('/participants');
  expect(activeStaffNavPath('/entities/referral-form', STAFF_NAV_ITEMS)).toBe(
    '/entities/referral-form',
  );
  expect(activeStaffNavPath('/entities', STAFF_NAV_ITEMS)).toBe('/entities');
  expect(activeStaffNavPath('/account', STAFF_NAV_ITEMS)).toBeNull();
  // Without the Derivacions item, its page still marks Participants.
  expect(
    activeStaffNavPath('/participants/referrals', [{ to: '/dashboard' }, { to: '/participants' }]),
  ).toBe('/participants');
});

test.each(SUPPORTED_LANGUAGES.map((language) => [language] as const))(
  'every group label resolves in %s',
  (language) => {
    const i18n = createI18n({ languageStorage: createInMemoryLanguageStorage() });
    const translate = i18n.getFixedT(language);
    for (const group of STAFF_NAV_GROUPS) {
      if (group.labelKey === null) continue;
      expect(translate(group.labelKey)).not.toBe(group.labelKey.replace(/^nav:/, ''));
    }
  },
);
