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
  });
  expect(parsed.email).toBe('fatou.ndiaye@example.com');

  expect(createParticipantInviteSchema.safeParse({ email: 'not-an-address' }).success).toBe(false);
});

test('invite payload carries the address, the optional entity and referral, snake_cased', () => {
  expect(
    buildCreateParticipantInvitePayload(
      { email: 'fatou.ndiaye@example.com', referenceEntity: ' CEAR Catalunya ' },
      '5eed0000-0000-4000-8010-000000000001',
    ),
  ).toEqual({
    email: 'fatou.ndiaye@example.com',
    reference_entity: 'CEAR Catalunya',
    referral_id: '5eed0000-0000-4000-8010-000000000001',
  });
  const plain = buildCreateParticipantInvitePayload({ email: 'fatou.ndiaye@example.com' });
  expect(plain.reference_entity).toBeNull();
  expect(plain.referral_id).toBeNull();
});
