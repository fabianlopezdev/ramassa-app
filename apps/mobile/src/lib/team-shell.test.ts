import { describe, expect, test } from 'bun:test';
import type { PermissionCode } from '@ramassa/shared/permissions';
import {
  contentKinds,
  hasMoreEntries,
  isCompactSidebar,
  moreGroups,
  showsToday,
  teamAreas,
  teamHome,
  teamLayout,
  teamStart,
} from './team-shell';

const codes = (...list: PermissionCode[]) => new Set<PermissionCode>(list);

describe('teamAreas', () => {
  test('attendance opens with marking or reports; messages with the inbox', () => {
    expect(teamAreas(codes('attendance.mark'))).toEqual(['attendance']);
    expect(teamAreas(codes('attendance.reports', 'messages.inbox'))).toEqual([
      'attendance',
      'messages',
    ]);
    expect(teamAreas(codes('settings.branding'))).toEqual([]);
    expect(teamAreas(codes('attendance.mark', 'participants.view', 'messages.inbox'))).toEqual([
      'attendance',
      'participants',
      'messages',
    ]);
  });

  test('stock opens with receiving, counting or the item list; a handover alone does not', () => {
    expect(teamAreas(codes('equipment.receive'))).toEqual(['stock']);
    expect(teamAreas(codes('equipment.count'))).toEqual(['stock']);
    expect(teamAreas(codes('equipment.items'))).toEqual(['stock']);
    expect(teamAreas(codes('equipment.handover'))).toEqual([]);
  });
});

describe('the content area (RAPP-340)', () => {
  test('opens with announcement editing or publishing, after participants', () => {
    expect(teamAreas(codes('announcements.edit'))).toEqual(['content']);
    expect(
      teamAreas(codes('announcements.publish', 'participants.view', 'messages.inbox')),
    ).toEqual(['participants', 'content', 'messages']);
  });

  test('events open it too, and the area lists the content types she manages (RAPP-342)', () => {
    expect(teamAreas(codes('events.edit'))).toEqual(['content']);
    expect(teamAreas(codes('events.publish', 'participants.view'))).toEqual([
      'participants',
      'content',
    ]);
    expect(contentKinds(codes('announcements.edit', 'events.publish'))).toEqual([
      'announcements',
      'events',
    ]);
    expect(contentKinds(codes('events.edit'))).toEqual(['events']);
    expect(contentKinds(codes('participants.view'))).toEqual([]);
    expect(contentKinds(codes('knowledge.publish', 'events.edit'))).toEqual([
      'events',
      'knowledge',
    ]);
    expect(teamAreas(codes('knowledge.edit'))).toEqual(['content']);
    expect(contentKinds(codes('services.review'))).toEqual(['reviews']);
    expect(teamAreas(codes('services.review'))).toEqual(['content']);
    expect(contentKinds(codes('services.edit', 'announcements.edit'))).toEqual([
      'announcements',
      'services',
    ]);
  });

  test('content alone starts on content', () => {
    const noToday = { today: false, more: false } as const;
    expect(teamStart(['content'], 'sidebar', noToday)).toBe('/content');
    expect(teamStart(['content', 'messages'], 'tabs', noToday)).toBe('/content');
  });
});

describe('teamLayout', () => {
  test('a tablet always gets the sidebar', () => {
    expect(teamLayout({ areaCount: 1, width: 768 })).toBe('sidebar');
    expect(teamLayout({ areaCount: 5, width: 1024 })).toBe('sidebar');
  });

  test('a phone with one or two areas gets large buttons; three or more get tabs', () => {
    expect(teamLayout({ areaCount: 1, width: 390 })).toBe('home');
    expect(teamLayout({ areaCount: 2, width: 390 })).toBe('home');
    expect(teamLayout({ areaCount: 3, width: 390 })).toBe('tabs');
  });
});

describe('teamStart', () => {
  const reach = { today: true, more: false } as const;

  test('the large-button home, or Today for everyone who has it (RAPP-795)', () => {
    expect(teamStart(['attendance', 'messages'], 'home', reach)).toBe('/home');
    expect(teamStart(['attendance', 'messages'], 'sidebar', reach)).toBe('/today');
    expect(teamStart(['messages'], 'sidebar', reach)).toBe('/today');
    expect(teamStart(['participants', 'messages'], 'tabs', reach)).toBe('/today');
  });

  test('without Today, the first area', () => {
    const noToday = { today: false, more: false } as const;
    expect(teamStart(['participants', 'content'], 'tabs', noToday)).toBe('/participants');
    expect(teamStart(['content'], 'sidebar', noToday)).toBe('/content');
  });

  test('stock alone on a tablet opens More, which holds it', () => {
    const stockOnly = { today: false, more: true } as const;
    expect(teamStart(['stock'], 'sidebar', stockOnly)).toBe('/more');
    expect(teamStart(['stock'], 'home', stockOnly)).toBe('/home');
  });

  test('no area but More tools: the home on a phone, More on a tablet (RAPP-797)', () => {
    const moreOnly = { today: false, more: true } as const;
    expect(teamStart([], 'home', moreOnly)).toBe('/home');
    expect(teamStart([], 'sidebar', moreOnly)).toBe('/more');
  });

  test('no area but a queue on Today: Today, or the home on a phone', () => {
    const todayOnly = { today: true, more: true } as const;
    expect(teamStart([], 'sidebar', todayOnly)).toBe('/today');
    expect(teamStart([], 'home', todayOnly)).toBe('/home');
  });

  test('nothing the app can show: the notice that points to the web', () => {
    expect(teamStart([], 'home', { today: false, more: false })).toBe('/team-home');
    expect(teamStart([], 'sidebar', { today: false, more: false })).toBe('/team-home');
  });
});

describe('teamHome (RAPP-797)', () => {
  test('designing onboarding alone has no screen in the app', () => {
    expect(teamHome(codes('onboarding.design'), 390)).toBe('/team-home');
    expect(teamHome(codes('onboarding.design'), 1024)).toBe('/team-home');
  });

  test('branding alone now reaches the organization details through More', () => {
    expect(teamHome(codes('settings.branding'), 390)).toBe('/home');
  });

  test('a More permission alone opens the large-button home on a phone', () => {
    expect(teamHome(codes('team.manage'), 390)).toBe('/home');
    expect(teamHome(codes('impact.view'), 1024)).toBe('/more');
  });

  test('the inbox alone starts on Today, where the unread chats wait', () => {
    expect(teamHome(codes('messages.inbox'), 1024)).toBe('/today');
    expect(teamHome(codes('messages.inbox'), 390)).toBe('/home');
  });
});

describe('showsToday (RAPP-795)', () => {
  test('attendance opens it, and so does any queue with its own permission', () => {
    expect(showsToday(codes('attendance.mark'))).toBe(true);
    expect(showsToday(codes('forum.moderate'))).toBe(true);
    expect(showsToday(codes('gallery.moderate'))).toBe(true);
    expect(showsToday(codes('feedback.view'))).toBe(true);
    expect(showsToday(codes('messages.inbox'))).toBe(true);
    expect(showsToday(codes('knowledge.edit'))).toBe(true);
  });

  test('no attendance and no queue: no Today', () => {
    expect(showsToday(codes('settings.branding'))).toBe(false);
    expect(showsToday(codes('team.manage', 'impact.view'))).toBe(false);
    expect(showsToday(codes())).toBe(false);
  });
});

describe('moreGroups (RAPP-796)', () => {
  const titles = (permissions: ReadonlySet<PermissionCode>) =>
    moreGroups(permissions).map(({ group, entries }) => [group, entries]);

  test('six groups in a fixed order, field work first and the app last', () => {
    const everything = codes(
      'consents.collect',
      'equipment.count',
      'mentoring.manage',
      'feedback.view',
      'forum.moderate',
      'notifications.send',
      'surveys.results',
      'impact.view',
      'audit.view',
      'settings.documents',
      'team.manage',
      'entities.manage',
      'settings.organization',
    );
    expect(titles(everything)).toEqual([
      ['field', ['collectSignatures', 'stock']],
      ['players', ['mentoring', 'feedback', 'moderation']],
      ['communication', ['notifications', 'surveys']],
      ['data', ['impact', 'data', 'documents']],
      ['organization', ['staff', 'entities', 'organization']],
      ['app', ['preview', 'settings', 'signOut']],
    ]);
  });

  test('a group with no permitted entry does not show; the app group always does', () => {
    expect(titles(codes())).toEqual([['app', ['preview', 'settings', 'signOut']]]);
    expect(titles(codes('surveys.manage'))).toEqual([
      ['communication', ['surveys']],
      ['app', ['preview', 'settings', 'signOut']],
    ]);
  });

  test('one Moderation entry for the forum or the gallery permission', () => {
    expect(titles(codes('gallery.moderate'))[0]).toEqual(['players', ['moderation']]);
    expect(titles(codes('forum.moderate', 'gallery.moderate'))[0]).toEqual([
      'players',
      ['moderation'],
    ]);
  });

  test('each entry keeps its own permission rule', () => {
    expect(titles(codes('equipment.handover'))).toHaveLength(1);
    expect(titles(codes('equipment.items'))[0]).toEqual(['field', ['stock']]);
    expect(titles(codes('export.events'))[0]).toEqual(['data', ['data']]);
    expect(titles(codes('settings.branding'))[0]).toEqual(['organization', ['organization']]);
  });
});

describe('hasMoreEntries (RAPP-797)', () => {
  test('true with at least one tool beyond the app group', () => {
    expect(hasMoreEntries(codes('impact.view'))).toBe(true);
    expect(hasMoreEntries(codes('equipment.count'))).toBe(true);
    expect(hasMoreEntries(codes('attendance.mark'))).toBe(false);
    expect(hasMoreEntries(codes())).toBe(false);
  });
});

describe('isCompactSidebar', () => {
  test('an upright tablet gets the narrow rail; a wide one the full sidebar', () => {
    expect(isCompactSidebar(820)).toBe(true);
    expect(isCompactSidebar(1180)).toBe(false);
  });
});
