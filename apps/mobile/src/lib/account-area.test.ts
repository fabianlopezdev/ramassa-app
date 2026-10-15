import { describe, expect, test } from 'bun:test';
import {
  areaHome,
  forgetAccount,
  readRememberedAccount,
  rememberAccount,
  resolveAccountArea,
  teamScreens,
  type AccountAreaStorage,
} from './account-area';

function memoryStorage(): AccountAreaStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

describe('resolveAccountArea', () => {
  test('each role has its own area', () => {
    expect(resolveAccountArea({ role: 'player', needsOnboarding: false, remembered: null })).toBe(
      'player',
    );
    expect(resolveAccountArea({ role: 'staff', needsOnboarding: false, remembered: null })).toBe(
      'team',
    );
    expect(resolveAccountArea({ role: 'admin', needsOnboarding: false, remembered: null })).toBe(
      'team',
    );
    expect(resolveAccountArea({ role: 'entity', needsOnboarding: false, remembered: null })).toBe(
      'entity',
    );
    // The preview account sees the player app (RAPP-370).
    expect(resolveAccountArea({ role: 'preview', needsOnboarding: false, remembered: null })).toBe(
      'player',
    );
  });

  test('an entity contact never resolves to the player tabs', () => {
    expect(
      resolveAccountArea({
        role: 'entity',
        needsOnboarding: false,
        remembered: { area: 'player', permissions: new Set() },
      }),
    ).toBe('entity');
  });

  test('an incomplete profile goes to onboarding first', () => {
    expect(resolveAccountArea({ role: null, needsOnboarding: true, remembered: null })).toBe(
      'onboarding',
    );
  });

  test('an unchecked account uses what this device remembers, offline', () => {
    expect(
      resolveAccountArea({
        role: null,
        needsOnboarding: false,
        remembered: { area: 'team', permissions: new Set(['attendance.mark']) },
      }),
    ).toBe('team');
  });

  test('an unchecked account with nothing remembered is unresolved, never a player by default', () => {
    expect(resolveAccountArea({ role: null, needsOnboarding: false, remembered: null })).toBe(
      'unresolved',
    );
  });
});

describe('the remembered account', () => {
  test('round-trips the area and the permissions per user', () => {
    const storage = memoryStorage();
    rememberAccount(storage, 'u1', { area: 'team', permissions: new Set(['attendance.mark']) });
    expect(readRememberedAccount(storage, 'u1')).toEqual({
      area: 'team',
      permissions: new Set(['attendance.mark']),
    });
    expect(readRememberedAccount(storage, 'u2')).toBeNull();
    forgetAccount(storage, 'u1');
    expect(readRememberedAccount(storage, 'u1')).toBeNull();
  });

  test('a damaged or edited entry is ignored, and unknown codes are dropped', () => {
    const storage = memoryStorage();
    storage.set('ramassa.account-area.v1:u1', 'not json');
    expect(readRememberedAccount(storage, 'u1')).toBeNull();
    storage.set(
      'ramassa.account-area.v1:u1',
      JSON.stringify({ area: 'superuser', permissions: [] }),
    );
    expect(readRememberedAccount(storage, 'u1')).toBeNull();
    storage.set(
      'ramassa.account-area.v1:u1',
      JSON.stringify({ area: 'team', permissions: ['attendance.mark', 'everything.all', 7] }),
    );
    expect(readRememberedAccount(storage, 'u1')?.permissions).toEqual(new Set(['attendance.mark']));
  });
});

test('team screens follow permissions', () => {
  expect(teamScreens(new Set(['announcements.edit'])).content).toBe(true);
  expect(teamScreens(new Set(['events.publish']))).toMatchObject({
    content: true,
    announcements: false,
    events: true,
    eventCategories: false,
  });
  expect(teamScreens(new Set(['events.edit'])).eventCategories).toBe(true);
  expect(teamScreens(new Set(['services.publish'])).serviceCategories).toBe(false);
  expect(teamScreens(new Set(['services.edit'])).serviceCategories).toBe(true);
  expect(teamScreens(new Set(['attendance.reports']))).toEqual({
    attendance: true,
    participants: false,
    content: false,
    announcements: false,
    events: false,
    eventCategories: false,
    knowledge: false,
    services: false,
    serviceCategories: false,
    serviceReviews: false,
    forumModeration: false,
    galleryModeration: false,
    feedback: false,
    notifications: false,
    documents: false,
    organization: false,
    dataExports: false,
    auditLog: false,
    staff: false,
    impact: false,
    mentoring: false,
    messages: false,
    stock: false,
    arrivals: false,
    counts: false,
    checkouts: false,
    items: false,
  });
  expect(teamScreens(new Set(['messages.inbox']))).toEqual({
    attendance: false,
    participants: false,
    content: false,
    announcements: false,
    events: false,
    eventCategories: false,
    knowledge: false,
    services: false,
    serviceCategories: false,
    serviceReviews: false,
    forumModeration: false,
    galleryModeration: false,
    feedback: false,
    notifications: false,
    documents: false,
    organization: false,
    dataExports: false,
    auditLog: false,
    staff: false,
    impact: false,
    mentoring: false,
    messages: true,
    stock: false,
    arrivals: false,
    counts: false,
    checkouts: false,
    items: false,
  });
  expect(teamScreens(new Set(['participants.view']))).toEqual({
    attendance: false,
    participants: true,
    content: false,
    announcements: false,
    events: false,
    eventCategories: false,
    knowledge: false,
    services: false,
    serviceCategories: false,
    serviceReviews: false,
    forumModeration: false,
    galleryModeration: false,
    feedback: false,
    notifications: false,
    documents: false,
    organization: false,
    dataExports: false,
    auditLog: false,
    staff: false,
    impact: false,
    mentoring: false,
    messages: false,
    stock: false,
    arrivals: false,
    counts: false,
    checkouts: false,
    items: false,
  });
  expect(teamScreens(new Set())).toEqual({
    attendance: false,
    participants: false,
    content: false,
    announcements: false,
    events: false,
    eventCategories: false,
    knowledge: false,
    services: false,
    serviceCategories: false,
    serviceReviews: false,
    forumModeration: false,
    galleryModeration: false,
    feedback: false,
    notifications: false,
    documents: false,
    organization: false,
    dataExports: false,
    auditLog: false,
    staff: false,
    impact: false,
    mentoring: false,
    messages: false,
    stock: false,
    arrivals: false,
    counts: false,
    checkouts: false,
    items: false,
  });
  // Stock opens with counting too; recording an arrival needs receiving (RAPP-250).
  expect(teamScreens(new Set(['equipment.count']))).toEqual({
    attendance: false,
    participants: false,
    content: false,
    announcements: false,
    events: false,
    eventCategories: false,
    knowledge: false,
    services: false,
    serviceCategories: false,
    serviceReviews: false,
    forumModeration: false,
    galleryModeration: false,
    feedback: false,
    notifications: false,
    documents: false,
    organization: false,
    dataExports: false,
    auditLog: false,
    staff: false,
    impact: false,
    mentoring: false,
    messages: false,
    stock: true,
    arrivals: false,
    counts: true,
    checkouts: true,
    items: false,
  });
});

test('while the first lookup after signing in runs, the area waits rather than failing', () => {
  expect(
    resolveAccountArea({
      role: null,
      needsOnboarding: false,
      isResolvingProfile: true,
      remembered: null,
    }),
  ).toBe('resolving');
  expect(
    resolveAccountArea({
      role: null,
      needsOnboarding: false,
      isResolvingProfile: true,
      remembered: { area: 'team', permissions: new Set() },
    }),
  ).toBe('team');
});

test('each area starts on its own home; the player keeps the root', () => {
  const phone = 390;
  const tablet = 1024;
  expect(areaHome('team', new Set(['attendance.mark', 'messages.inbox']), phone)).toBe('/home');
  expect(areaHome('team', new Set(['attendance.mark', 'messages.inbox']), tablet)).toBe('/today');
  expect(areaHome('team', new Set(['messages.inbox']), tablet)).toBe('/messages');
  expect(areaHome('team', new Set(['settings.branding']), phone)).toBe('/team-home');
  expect(areaHome('entity', new Set(), phone)).toBe('/entity-portal');
  expect(areaHome('unresolved', new Set(), phone)).toBe('/account-unresolved');
  expect(areaHome('player', new Set(), phone)).toBeNull();
});

test('any export permission opens the exports, and audit.view the audit log', () => {
  expect(teamScreens(new Set(['export.events']))).toMatchObject({
    dataExports: true,
    auditLog: false,
  });
  expect(teamScreens(new Set(['audit.view']))).toMatchObject({
    dataExports: false,
    auditLog: true,
  });
});

test('impact.view opens the impact dashboard', () => {
  expect(teamScreens(new Set(['impact.view'])).impact).toBe(true);
  expect(teamScreens(new Set(['export.attendance'])).impact).toBe(false);
});

test('team.manage opens the team screen', () => {
  expect(teamScreens(new Set(['team.manage'])).staff).toBe(true);
  expect(teamScreens(new Set(['settings.branding'])).staff).toBe(false);
});

test('organization or branding settings open the organization screen', () => {
  expect(teamScreens(new Set(['settings.branding'])).organization).toBe(true);
  expect(teamScreens(new Set(['settings.organization'])).organization).toBe(true);
  expect(teamScreens(new Set(['settings.documents'])).organization).toBe(false);
});

test('settings.documents opens the internal documents', () => {
  expect(teamScreens(new Set(['settings.documents'])).documents).toBe(true);
  expect(teamScreens(new Set(['settings.branding'])).documents).toBe(false);
});
