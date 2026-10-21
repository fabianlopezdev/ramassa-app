/**
 * The participant invitation schema (RAPP-25, RAPP-227): what staff type when
 * inviting a player, and the exact snake_case payload the RPC reads.
 *
 * The payload builder is tested key by key because no type checker crosses the
 * SQL boundary: a camelCase key that leaks through arrives in Postgres as an
 * absent field.
 */

import { expect, test } from 'bun:test';
import { buildCreateParticipantInvitePayload, createParticipantInviteSchema } from './accounts';

test('createParticipantInviteSchema normalizes the address the way login does', () => {
  // Same normalization as loginEmailSchema: the invite row must match the
  // identity that eventually signs in, capitals and padding included.
  const parsed = createParticipantInviteSchema.parse({
    email: '  Fatou.Ndiaye@Example.COM ',
    firstName: 'Fatou',
    lastName: 'Ndiaye',
  });
  expect(parsed.email).toBe('fatou.ndiaye@example.com');

  expect(
    createParticipantInviteSchema.safeParse({
      email: 'not-an-address',
      firstName: 'Fatou',
      lastName: 'Ndiaye',
    }).success,
  ).toBe(false);
});

test('an invitation needs her first and last name, because it creates her profile (RAPP-300)', () => {
  expect(
    createParticipantInviteSchema.safeParse({ email: 'fatou@example.com', firstName: 'Fatou' })
      .success,
  ).toBe(false);
  expect(
    createParticipantInviteSchema.safeParse({
      email: 'fatou@example.com',
      firstName: '  ',
      lastName: 'Ndiaye',
    }).success,
  ).toBe(false);
});

test('invite payload carries the address, the optional entity and referral, snake_cased', () => {
  expect(
    buildCreateParticipantInvitePayload(
      {
        email: 'fatou.ndiaye@example.com',
        firstName: 'Fatou',
        lastName: 'Ndiaye',
        referenceEntity: ' CEAR Catalunya ',
      },
      '5eed0000-0000-4000-8010-000000000001',
    ),
  ).toEqual({
    email: 'fatou.ndiaye@example.com',
    first_name: 'Fatou',
    last_name: 'Ndiaye',
    reference_entity: 'CEAR Catalunya',
    referral_id: '5eed0000-0000-4000-8010-000000000001',
    is_test_account: false,
  });
  const plain = buildCreateParticipantInvitePayload({
    email: 'fatou.ndiaye@example.com',
    firstName: 'Fatou',
    lastName: 'Ndiaye',
  });
  expect(plain.reference_entity).toBeNull();
  expect(plain.referral_id).toBeNull();
});

test('a test player (RAPP-615) is an ordinary invitation with the flag on and no referral', () => {
  const parsed = createParticipantInviteSchema.parse({
    email: 'joana.prova@example.test',
    firstName: 'Joana',
    lastName: 'Prova',
    isTestAccount: true,
  });
  expect(buildCreateParticipantInvitePayload(parsed)).toEqual({
    email: 'joana.prova@example.test',
    first_name: 'Joana',
    last_name: 'Prova',
    reference_entity: null,
    referral_id: null,
    is_test_account: true,
  });
  // Absent means a real player: the flag is never on by accident.
  expect(
    createParticipantInviteSchema.parse({ email: 'a@example.test', firstName: 'A', lastName: 'B' })
      .isTestAccount,
  ).toBe(false);
  // A made-up woman never answers a real referral.
  expect(
    buildCreateParticipantInvitePayload(parsed, '5eed0000-0000-4000-8010-000000000001'),
  ).toEqual(expect.objectContaining({ referral_id: null, is_test_account: true }));
});

test('the confirmed question states travel with the invitation, and only when set (RAPP-618)', () => {
  const input = { email: 'fatou.ndiaye@example.com', firstName: 'Fatou', lastName: 'Ndiaye' };
  expect('question_states' in buildCreateParticipantInvitePayload(input)).toBe(false);
  expect(
    buildCreateParticipantInvitePayload(input, null, { phone: 'skip', first_name: 'ask' })
      .question_states,
  ).toEqual({ phone: 'skip', first_name: 'ask' });
});
