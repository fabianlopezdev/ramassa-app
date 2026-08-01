/**
 * The account-lifecycle schemas (RAPP-25): what staff type when creating an
 * account or an invite, and the exact snake_case payloads the RPCs read.
 *
 * The payload builders are tested key by key because no type checker crosses
 * the SQL boundary: a camelCase key that leaks through arrives in Postgres as
 * an absent field, and `create_participant_account` would then refuse a
 * perfectly good form with "requires first_name and last_name".
 */

import { expect, test } from 'bun:test';
import {
  buildCreateParticipantAccountPayload,
  buildCreateParticipantInvitePayload,
  createParticipantAccountSchema,
  createParticipantInviteSchema,
} from './accounts';

test('createParticipantAccountSchema trims names and requires both', () => {
  const parsed = createParticipantAccountSchema.parse({
    firstName: '  Amina ',
    lastName: ' Diallo ',
    referenceEntity: '',
  });
  expect(parsed.firstName).toBe('Amina');
  expect(parsed.lastName).toBe('Diallo');

  expect(
    createParticipantAccountSchema.safeParse({ firstName: '   ', lastName: 'Diallo' }).success,
  ).toBe(false);
  expect(createParticipantAccountSchema.safeParse({ firstName: 'Amina' }).success).toBe(false);
});

test('account payload speaks the snake_case the RPC declares, with no domain in sight', () => {
  const payload = buildCreateParticipantAccountPayload({
    firstName: 'Amina',
    lastName: 'Diallo',
    referenceEntity: 'Creu Roja Osona',
  });
  // The keys, exactly: the RPC reads these names out of the jsonb.
  expect(payload).toEqual({
    first_name: 'Amina',
    last_name: 'Diallo',
    reference_entity: 'Creu Roja Osona',
  });
  // The generated address is the SERVER's business (ADR-022): nothing the
  // client sends may carry or influence a domain.
  expect(JSON.stringify(payload)).not.toContain('@');
});

test('an untouched entity field becomes null, not an empty string in the database', () => {
  expect(
    buildCreateParticipantAccountPayload({ firstName: 'A', lastName: 'B' }).reference_entity,
  ).toBeNull();
  expect(
    buildCreateParticipantAccountPayload({ firstName: 'A', lastName: 'B', referenceEntity: '' })
      .reference_entity,
  ).toBeNull();
});

test('createParticipantInviteSchema normalizes the address the way login does', () => {
  // Same normalization as loginEmailSchema: the invite row must match the
  // identity that eventually signs in, capitals and padding included.
  const parsed = createParticipantInviteSchema.parse({
    email: '  Fatou.Ndiaye@Example.COM ',
  });
  expect(parsed.email).toBe('fatou.ndiaye@example.com');

  expect(createParticipantInviteSchema.safeParse({ email: 'not-an-address' }).success).toBe(false);
});

test('invite payload carries the address and the optional entity, snake_cased', () => {
  expect(
    buildCreateParticipantInvitePayload({
      email: 'fatou.ndiaye@example.com',
      referenceEntity: ' CEAR Catalunya ',
    }),
  ).toEqual({
    email: 'fatou.ndiaye@example.com',
    reference_entity: 'CEAR Catalunya',
  });
  expect(
    buildCreateParticipantInvitePayload({ email: 'fatou.ndiaye@example.com' }).reference_entity,
  ).toBeNull();
});
