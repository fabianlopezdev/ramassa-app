/**
 * The authorization signed on a staff tablet (RAPP-305): what the tablet sends
 * for a player and for a walk-in, and the review queue's actions.
 */
import { describe, expect, test } from 'bun:test';
import { isAppError } from '../errors';
import { buildAuthorizationVersion, buildWalkInSigning } from '../testing/factories';
import {
  confirmWalkIn,
  fetchAuthorizationForSigning,
  fetchWalkInSignings,
  mergeWalkIn,
  sendTabletSigning,
  signerName,
  walkInNameSchema,
  type TabletSigning,
} from './tablet';

function clientReturning(result: { data: unknown; error: unknown }) {
  const calls: unknown[] = [];
  const client = {
    rpc: (name: string, args?: unknown) => {
      calls.push(args === undefined ? [name] : [name, args]);
      return Promise.resolve(result);
    },
  };
  return { client: client as never, calls };
}

const signingId = '0b5e0000-0000-4000-8000-000000000001';
const signing: TabletSigning = {
  id: signingId,
  signer: { kind: 'player', profileId: '5eed0000-0000-4000-8000-000000000022', name: 'Наталія' },
  versionId: buildAuthorizationVersion().id,
  payload: { consents: {}, language: 'uk' },
  signedAt: '2026-10-16T17:00:00.000Z',
};

describe('fetchAuthorizationForSigning', () => {
  test('reads the current version, or null when none is published', async () => {
    const version = buildAuthorizationVersion();
    const { client } = clientReturning({
      data: [
        {
          version_id: version.id,
          season_name: '2026/27',
          version_number: 1,
          content: version.content,
        },
      ],
      error: null,
    });
    const found = await fetchAuthorizationForSigning(client);
    expect(found?.versionId).toBe(version.id);
    expect(found?.content.consents.health_data?.required).toBe(true);
    expect(
      await fetchAuthorizationForSigning(clientReturning({ data: [], error: null }).client),
    ).toBe(null);
  });
});

describe('sendTabletSigning', () => {
  test("a player's signing goes to the staff-device record with the tablet's id and time", async () => {
    const { client, calls } = clientReturning({ data: signingId, error: null });
    expect(await sendTabletSigning(client, signing)).toBe(signingId);
    expect(calls).toEqual([
      [
        'record_staff_device_signature',
        {
          p_signature_id: signingId,
          p_profile_id: '5eed0000-0000-4000-8000-000000000022',
          p_version_id: signing.versionId,
          p_payload: signing.payload,
          p_signed_at: signing.signedAt,
        },
      ],
    ]);
  });

  test('a walk-in goes to the review queue with her trimmed name', async () => {
    const { client, calls } = clientReturning({ data: signingId, error: null });
    await sendTabletSigning(client, {
      ...signing,
      signer: { kind: 'walk_in', firstName: ' Rim ', lastName: 'Haddad ' },
    });
    expect(calls[0]).toEqual([
      'submit_walk_in_signing',
      {
        p_id: signingId,
        p_first_name: 'Rim',
        p_last_name: 'Haddad',
        p_version_id: signing.versionId,
        p_payload: signing.payload,
        p_signed_at: signing.signedAt,
      },
    ]);
  });

  test('a refusal is a final error, so the outbox keeps the signing marked', async () => {
    const { client } = clientReturning({
      data: null,
      error: { message: 'consents.collect required', code: '42501' },
    });
    const failure = await sendTabletSigning(client, signing).catch((error: unknown) => error);
    expect(isAppError(failure) && failure.code).toBe('AUTH-3');
  });
});

describe('walk-ins', () => {
  test('a walk-in needs a first and a last name', () => {
    expect(walkInNameSchema.safeParse({ firstName: 'Rim', lastName: ' ' }).success).toBe(false);
    expect(walkInNameSchema.safeParse({ firstName: 'Rim', lastName: 'Haddad' }).success).toBe(true);
    expect(signerName({ kind: 'walk_in', firstName: 'Rim', lastName: 'Haddad' })).toBe(
      'Rim Haddad',
    );
  });

  test('the review queue lists who waits, and who collected her signing', async () => {
    const walkIn = buildWalkInSigning();
    const { client } = clientReturning({
      data: [
        {
          id: walkIn.id,
          first_name: walkIn.first_name,
          last_name: walkIn.last_name,
          signed_at: walkIn.signed_at,
          collected_by_name: 'Laia Puig',
          created_at: walkIn.created_at,
        },
      ],
      error: null,
    });
    const [row] = await fetchWalkInSignings(client);
    expect(row?.firstName).toBe('Salma');
    expect(row?.collectedByName).toBe('Laia Puig');
  });

  test('confirming sends her email in lower case; a stale second factor is AUTH-9', async () => {
    const { client, calls } = clientReturning({ data: signingId, error: null });
    await confirmWalkIn(client, signingId, ' Salma.Idrissi@Example.test ');
    expect(calls[0]).toEqual([
      'confirm_walk_in',
      { p_id: signingId, p_email: 'salma.idrissi@example.test' },
    ]);
    const stale = clientReturning({
      data: null,
      error: { message: 'step_up_required', code: '42501' },
    });
    const failure = await confirmWalkIn(stale.client, signingId, 'a@example.test').catch(
      (error: unknown) => error,
    );
    expect(isAppError(failure) && failure.code).toBe('AUTH-9');
  });

  test('merging names the player she already is', async () => {
    const { client, calls } = clientReturning({ data: null, error: null });
    await mergeWalkIn(client, signingId, '5eed0000-0000-4000-8000-000000000023');
    expect(calls[0]).toEqual([
      'merge_walk_in',
      { p_id: signingId, p_profile_id: '5eed0000-0000-4000-8000-000000000023' },
    ]);
  });
});
