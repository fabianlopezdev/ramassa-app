import { describe, expect, test } from 'bun:test';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { isCompactSidebar, teamAreas, teamLayout, teamStart } from './team-shell';

const codes = (...list: PermissionCode[]) => new Set<PermissionCode>(list);

describe('teamAreas', () => {
  test('attendance opens with marking or reports; messages with the inbox', () => {
    expect(teamAreas(codes('attendance.mark'))).toEqual(['attendance']);
    expect(teamAreas(codes('attendance.reports', 'messages.inbox'))).toEqual([
      'attendance',
      'messages',
    ]);
    expect(teamAreas(codes('settings.branding'))).toEqual([]);
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
