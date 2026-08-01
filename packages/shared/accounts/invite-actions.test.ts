/**
 * The invite seam (RAPP-25): sending an invite, listing what the organization
 * has sent, and the wizard's own lookup of the invite waiting for the address
 * that signed in.
 *
 * `my_pending_invite` takes NO argument by design (the migration's whole
 * argument): the test pins that shape so a future "helpful" refactor cannot
 * add an email parameter and reopen the door it closed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'bun:test';
import { AppError } from '../errors';
import type { Database } from '../types/database';
import { createParticipantInvite, fetchInvites, fetchMyPendingInvite } from './invite-actions';
import {
  INVITE_COLUMNS,
  inviterName,
  inviteStatus,
  prefilledReferenceEntity,
  type InviteRow,
} from './invites';

type Client = SupabaseClient<Database>;

interface RpcCall {
  readonly name: string;
  readonly args: unknown;
}

function rpcClient(result: { data: unknown; error: unknown }, calls: RpcCall[] = []): Client {
  return {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return result;
    },
  } as unknown as Client;
}

const createdInvite = {
  invite_id: '11110000-0000-4000-8000-000000000001',
  email: 'fatou.ndiaye@example.com',
  expires_at: '2026-08-31T12:00:00Z',
};

test('createParticipantInvite sends the payload under the name the RPC declares', async () => {
  const calls: RpcCall[] = [];
  const payload = { email: 'fatou.ndiaye@example.com', reference_entity: 'CEAR Catalunya' };
  await createParticipantInvite(rpcClient({ data: [createdInvite], error: null }, calls), payload);

  expect(calls[0]?.name).toBe('create_participant_invite');
  expect(calls[0]?.args).toEqual({ payload });
});

test('createParticipantInvite returns the recorded invite with its expiry', async () => {
  const invite = await createParticipantInvite(rpcClient({ data: [createdInvite], error: null }), {
    email: 'fatou.ndiaye@example.com',
    reference_entity: null,
  });
  expect(invite.email).toBe('fatou.ndiaye@example.com');
  expect(invite.expires_at).toBe('2026-08-31T12:00:00Z');
});

test('createParticipantInvite treats an empty result or a refusal as a failure', async () => {
  await expect(
    createParticipantInvite(rpcClient({ data: [], error: null }), {
      email: 'fatou.ndiaye@example.com',
      reference_entity: null,
    }),
  ).rejects.toBeInstanceOf(AppError);

  await expect(
    createParticipantInvite(rpcClient({ data: null, error: { message: 'rate limit reached' } }), {
      email: 'fatou.ndiaye@example.com',
      reference_entity: null,
    }),
  ).rejects.toBeInstanceOf(AppError);
});

test('fetchInvites reads the invite columns with the inviter embedded by constraint name', async () => {
  const selected: string[] = [];
  const client = {
    from: (table: string) => ({
      select: (columns: string) => {
        selected.push(`${table}:${columns}`);
        return {
          order: async () => ({ data: [], error: null }),
        };
      },
    }),
  } as unknown as Client;

  expect(await fetchInvites(client)).toEqual([]);
  // `invites` points at `profiles` twice (inviter and acceptor), so an
  // unqualified embed is ambiguous and PostgREST refuses it.
  expect(selected[0]).toBe(`invites:${INVITE_COLUMNS}`);
  expect(INVITE_COLUMNS).toContain('invites_invited_by_fkey');
});

test('fetchMyPendingInvite passes NOTHING: the address comes from the JWT alone', async () => {
  const calls: RpcCall[] = [];
  const pending = await fetchMyPendingInvite(
    rpcClient(
      {
        data: [{ reference_entity: 'Creu Roja Osona', invited_at: '2026-08-01T10:00:00Z' }],
        error: null,
      },
      calls,
    ),
  );

  expect(calls[0]?.name).toBe('my_pending_invite');
  expect(calls[0]?.args).toBeUndefined();
  expect(pending?.reference_entity).toBe('Creu Roja Osona');
});

/**
 * No pending invite is the NORMAL case (most players sign up uninvited), so it
 * is a null the wizard shrugs at, never a thrown failure that could block
 * onboarding for everyone else.
 */
test('fetchMyPendingInvite reports no invite as absent, not as a failure', async () => {
  expect(await fetchMyPendingInvite(rpcClient({ data: [], error: null }))).toBeNull();
});

test('fetchMyPendingInvite reports a FAILED read as a failure, never as "no invite"', async () => {
  await expect(
    fetchMyPendingInvite(rpcClient({ data: null, error: { message: 'connection reset' } })),
  ).rejects.toBeInstanceOf(AppError);
});

// The pure readings the invitations screen makes of a row -----------------------------

function inviteRow(overrides: Partial<InviteRow>): InviteRow {
  return {
    id: '11110000-0000-4000-8000-000000000001',
    email: 'fatou.ndiaye@example.com',
    reference_entity: null,
    created_at: '2026-08-01T10:00:00Z',
    expires_at: '2026-08-31T10:00:00Z',
    accepted_at: null,
    invited_by: '5eed0000-0000-4000-8000-000000000002',
    inviter: { first_name: 'Marta', last_name: 'Puig' },
    ...overrides,
  };
}

test('an invite is pending until its expiry and expired after it', () => {
  const row = inviteRow({});
  expect(inviteStatus(row, new Date('2026-08-15T00:00:00Z'))).toBe('pending');
  expect(inviteStatus(row, new Date('2026-09-01T00:00:00Z'))).toBe('expired');
});

/**
 * Accepted WINS over expired: an invite spent in time stays "accepted" forever,
 * because the row's expiry passing later does not un-onboard anyone.
 */
test('an accepted invite stays accepted even after its expiry passes', () => {
  const row = inviteRow({ accepted_at: '2026-08-10T10:00:00Z' });
  expect(inviteStatus(row, new Date('2026-09-15T00:00:00Z'))).toBe('accepted');
});

test('an invite whose inviter is unreadable is signed by nobody, not by "null null"', () => {
  expect(inviterName(inviteRow({}))).toBe('Marta Puig');
  expect(inviterName(inviteRow({ inviter: null }))).toBeNull();
});

// What the wizard shows in its referring-entity field --------------------------------

test('an unanswered entity field takes the invite as its default', () => {
  expect(prefilledReferenceEntity('', 'Creu Roja Osona')).toBe('Creu Roja Osona');
  expect(prefilledReferenceEntity(undefined, 'Creu Roja Osona')).toBe('Creu Roja Osona');
});

/**
 * The precedence that makes the prefill safe. An invite is what the TEAM
 * believes; the profile is what SHE says. A prefill arriving from the network
 * a moment after she started typing must not overwrite her.
 */
test('what she already typed always wins over the invite', () => {
  expect(prefilledReferenceEntity('CEAR Catalunya', 'Creu Roja Osona')).toBe('CEAR Catalunya');
});

/**
 * "No entity" is an ANSWER, not an empty field: the chip stores null. An
 * invite must not quietly undo it and attach an entity she said no to.
 */
test('her explicit "no entity" is never overwritten by an invite', () => {
  expect(prefilledReferenceEntity(null, 'Creu Roja Osona')).toBeNull();
});

test('no invite, or an invite with no entity, leaves the field exactly as it was', () => {
  expect(prefilledReferenceEntity('', null)).toBe('');
  expect(prefilledReferenceEntity('', undefined)).toBe('');
  expect(prefilledReferenceEntity('', '')).toBe('');
  expect(prefilledReferenceEntity(undefined, null)).toBeUndefined();
});
