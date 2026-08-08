import { expect, test } from 'bun:test';
import { sidebarSideForDirection } from './staff-sidebar';

test('staff sidebar follows the document writing direction', () => {
  expect(sidebarSideForDirection('ltr')).toBe('left');
  expect(sidebarSideForDirection('rtl')).toBe('right');
});
