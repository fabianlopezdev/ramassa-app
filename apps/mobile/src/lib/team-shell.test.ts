import { describe, expect, test } from 'bun:test';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { contentKinds, isCompactSidebar, teamAreas, teamLayout, teamStart } from './team-shell';

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
  });

  test('content alone starts on content', () => {
    expect(teamStart(['content'], 'sidebar')).toBe('/content');
    expect(teamStart(['content', 'messages'], 'tabs')).toBe('/content');
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
  test('the large-button home, or the first area', () => {
    expect(teamStart(['attendance', 'messages'], 'home')).toBe('/home');
    expect(teamStart(['attendance', 'messages'], 'sidebar')).toBe('/today');
    expect(teamStart(['messages'], 'sidebar')).toBe('/messages');
    expect(teamStart(['participants', 'messages'], 'tabs')).toBe('/participants');
  });

  test('stock alone on a tablet opens More, which holds it', () => {
    expect(teamStart(['stock'], 'sidebar')).toBe('/more');
    expect(teamStart(['stock'], 'home')).toBe('/home');
  });

  test('no area in the app yet: the notice that points to the web', () => {
    expect(teamStart([], 'home')).toBe('/team-home');
  });
});

describe('isCompactSidebar', () => {
  test('an upright tablet gets the narrow rail; a wide one the full sidebar', () => {
    expect(isCompactSidebar(820)).toBe(true);
    expect(isCompactSidebar(1180)).toBe(false);
  });
});
