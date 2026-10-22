import { expect, test } from 'bun:test';
import { accountDisplayName, accountInitials, organizationInitials } from './initials';

test('the user menu shows her full name, else her email', () => {
  expect(accountDisplayName({ firstName: 'Laia', lastName: 'Ferrer', email: 'l@x.test' })).toBe(
    'Laia Ferrer',
  );
  expect(accountDisplayName({ firstName: ' ', lastName: '', email: 'l@x.test' })).toBe('l@x.test');
});

test('the avatar falls back to her initials, else the first letter of her email', () => {
  expect(accountInitials({ firstName: 'laia', lastName: 'ferrer', email: 'l@x.test' })).toBe('LF');
  expect(accountInitials({ firstName: 'Laia', lastName: '', email: 'l@x.test' })).toBe('L');
  expect(accountInitials({ firstName: '', lastName: '', email: 'pau@x.test' })).toBe('P');
});

test('an organization without a logo shows up to two initials', () => {
  expect(organizationInitials('AE Ramassà')).toBe('AR');
  expect(organizationInitials('Club   Esportiu de Prova')).toBe('CE');
  expect(organizationInitials('«Ramassà»')).toBe('R');
});
