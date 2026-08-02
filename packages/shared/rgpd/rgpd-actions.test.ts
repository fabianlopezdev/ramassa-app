import { describe, expect, test } from 'bun:test';
import { AppError } from '../errors';
import {
  anonymizeParticipant,
  deleteParticipantPermanently,
  eraseParticipant,
  fetchDeletionRequests,
  resolveDeletionRequest,
  type ErasureDependencies,
} from './rgpd-actions';

const PARTICIPANT = '5eed0000-0000-4000-8000-000000000011';

interface RpcCall {
  readonly name: string;
  readonly args: unknown;
}

/**
 * A Supabase client stand-in that records what it was asked and answers with
 * whatever the test wants. The real client is not mocked wholesale: only the two
 * seams these functions actually touch.
 */
function buildClient(options: { readonly rpcError?: { message: string } } = {}) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return Promise.resolve({ data: null, error: options.rpcError ?? null });
      },
    } as never,
  };
}

describe('anonymizeParticipant', () => {
  test('calls the RPC with her id', async () => {
    const { client, calls } = buildClient();
    await anonymizeParticipant(client, PARTICIPANT);
    expect(calls).toEqual([
      { name: 'anonymize_participant', args: { participant_id: PARTICIPANT } },
    ]);
  });

  test('a refusal arrives as a typed error, never as a silent success', async () => {
    const { client } = buildClient({ rpcError: { message: 'permission denied' } });
    await expect(anonymizeParticipant(client, PARTICIPANT)).rejects.toBeInstanceOf(AppError);
  });
});

describe('deleteParticipantPermanently - what the database refused, said in words', () => {
  /**
   * The RPC raises with a stable token at the front of its message, and these
   * cases are the whole reason: a staff member who is told "database operation
   * failed" learns nothing, while "her photos have to go first" is an
   * instruction she can act on. Mapping on the token rather than on the prose
   * keeps the message free to change.
   */
  test.each([
    ['DELETION_MEDIA_NOT_PURGED: her uploaded media must be removed first', 'DB-4'],
    ['DELETION_INCOMPLETE: rows survived in invites.accepted_by', 'DB-3'],
    ['DELETION_NO_SUBJECT: no such participant in this organization', 'DB-2'],
    ['DELETION_NOT_A_PARTICIPANT: only a participant record can be erased here', 'DB-2'],
    ['permission denied for function delete_participant_permanently', 'DB-1'],
  ])('%s maps to %s', async (message, expectedCode) => {
    const { client } = buildClient({ rpcError: { message } });
    await expect(deleteParticipantPermanently(client, PARTICIPANT)).rejects.toMatchObject({
      code: expectedCode,
    });
  });

  test('a clean run calls the RPC once and returns nothing', async () => {
    const { client, calls } = buildClient();
    await expect(deleteParticipantPermanently(client, PARTICIPANT)).resolves.toBeUndefined();
    expect(calls).toEqual([
      { name: 'delete_participant_permanently', args: { participant_id: PARTICIPANT } },
    ]);
  });
});

describe('eraseParticipant - the two halves, in order', () => {
  function buildDependencies(
    overrides: Partial<ErasureDependencies> = {},
  ): ErasureDependencies & { readonly steps: string[] } {
    const steps: string[] = [];
    return {
      steps,
      purgeMedia: async () => {
        steps.push('purge');
        return { ok: true, value: { objectsDeleted: 2 } };
      },
      deleteRecord: async () => {
        steps.push('delete');
      },
      ...overrides,
    } as ErasureDependencies & { readonly steps: string[] };
  }

  /**
   * THE ORDER IS THE SAFETY PROPERTY (ADR-023). The two halves cannot share a
   * transaction, so the sequence decides which way a partial failure falls:
   * media first leaves her record present and the whole thing retryable, while
   * record first would strand objects in a bucket with nothing left to say
   * whose they were.
   */
  test('the media is swept before the record is deleted', async () => {
    const dependencies = buildDependencies();
    const result = await eraseParticipant(PARTICIPANT, dependencies);

    expect(result.ok).toBe(true);
    expect(dependencies.steps).toEqual(['purge', 'delete']);
  });

  /**
   * And if the sweep fails, the record must still be there. Without this the
   * order above would be decorative: the call would proceed to delete her row
   * while her photographs stayed in the bucket.
   */
  test('a failed sweep stops before the record is touched', async () => {
    const steps: string[] = [];
    const result = await eraseParticipant(PARTICIPANT, {
      purgeMedia: async () => {
        steps.push('purge');
        return { ok: false, error: new AppError('UPLOAD-7') };
      },
      deleteRecord: async () => {
        steps.push('delete');
      },
    });

    expect(result.ok).toBe(false);
    expect(steps).toEqual(['purge']);
  });

  test('a failed deletion reports the database code, not the upload one', async () => {
    const result = await eraseParticipant(PARTICIPANT, {
      purgeMedia: async () => ({ ok: true, value: { objectsDeleted: 0 } }),
      deleteRecord: async () => {
        throw new AppError('DB-3');
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe('DB-3');
  });

  /**
   * A participant with nothing in the bucket still needs the sweep to run: it is
   * what writes the receipt Postgres checks for. Skipping it as an optimization
   * would make erasure fail for exactly the participants who uploaded nothing,
   * which is most of them.
   */
  test('the sweep runs even when she has no media at all', async () => {
    const dependencies = buildDependencies({
      purgeMedia: async () => ({ ok: true, value: { objectsDeleted: 0 } }),
    });
    const result = await eraseParticipant(PARTICIPANT, dependencies);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.objectsDeleted : -1).toBe(0);
  });
});

describe('the deletion-request queue', () => {
  test('fetchDeletionRequests asks for the open ones, newest first', async () => {
    const queries: string[] = [];
    const client = {
      from(table: string) {
        queries.push(`from:${table}`);
        const builder = {
          select(columns: string) {
            queries.push(`select:${columns}`);
            return builder;
          },
          eq(column: string, value: string) {
            queries.push(`eq:${column}=${value}`);
            return builder;
          },
          order(column: string, options: { ascending: boolean }) {
            queries.push(`order:${column}:${options.ascending ? 'asc' : 'desc'}`);
            return Promise.resolve({ data: [], error: null });
          },
        };
        return builder;
      },
    } as never;

    await fetchDeletionRequests(client, 'open');

    expect(queries).toContain('from:deletion_requests');
    expect(queries).toContain('eq:state=open');
    expect(queries).toContain('order:created_at:desc');
  });

  test('resolving a request records who resolved it and when', async () => {
    let updated: Record<string, unknown> = {};
    const client = {
      from() {
        return {
          update(values: Record<string, unknown>) {
            updated = values;
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      },
    } as never;

    await resolveDeletionRequest(client, {
      requestId: 'req-1',
      state: 'done',
      resolvedBy: 'staff-1',
      resolutionNote: 'Erased at her request.',
    });

    expect(updated.state).toBe('done');
    expect(updated.resolved_by).toBe('staff-1');
    expect(updated.resolution_note).toBe('Erased at her request.');
    expect(typeof updated.resolved_at).toBe('string');
  });
});
