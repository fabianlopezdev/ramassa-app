import { describe, expect, test } from 'bun:test';
import { shouldMountAuthRoutes } from './auth-route-readiness';

describe('auth route readiness', () => {
  test('keeps protected route guards unmounted until persisted auth resolves', () => {
    expect(shouldMountAuthRoutes(true)).toBe(false);
    expect(shouldMountAuthRoutes(false)).toBe(true);
  });
});
