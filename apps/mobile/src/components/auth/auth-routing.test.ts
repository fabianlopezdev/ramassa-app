import { expect, test } from 'bun:test';
import { AUTH_ROUTE_TARGETS } from './auth-routing';

test('the two router screens send every choice to its explicit next screen', () => {
  expect(AUTH_ROUTE_TARGETS.firstTime).toBe('/registration-method');
  expect(AUTH_ROUTE_TARGETS.returning).toBe('/email-login');
  expect(AUTH_ROUTE_TARGETS.registeredByEmail).toBe('/email-login');
  expect(AUTH_ROUTE_TARGETS.registeredByCode).toBe('/access-code-login');
});
