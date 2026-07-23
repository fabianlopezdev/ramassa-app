import { expect, test } from 'bun:test';
import { roleLandingPath } from './role-landing';

test('staff and admin land on the dashboard', () => {
  expect(roleLandingPath('staff')).toBe('/dashboard');
  expect(roleLandingPath('admin')).toBe('/dashboard');
});

test('an entity user lands on the portal', () => {
  expect(roleLandingPath('entity')).toBe('/portal');
});

test('a player has NO admin landing, so guards never redirect them in a loop', () => {
  // Regression guard: returning '/dashboard' here sent a player into
  // /dashboard -> guard rejects -> /dashboard -> ... forever.
  expect(roleLandingPath('player')).toBeNull();
  expect(roleLandingPath(null)).toBeNull();
});
