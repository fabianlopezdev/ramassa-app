import { describe, expect, test } from 'bun:test';
import { isAppError } from '../errors';
import {
  awaitsReturn,
  fetchParticipantMaterialDetail,
  recordEquipmentHandover,
  SIGNATURE_MAX_POINTS,
  signatureStrokesSchema,
  type HandoverInput,
  type ParticipantMaterialRow,
} from './handover';

function buildRpcClient(result: { readonly data?: unknown; readonly error?: unknown }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    client: {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
      },
    } as never,
  };
}

const base: HandoverInput = {
  id: '00000000-0000-4000-8000-000000000001',
  handedOverAt: '2026-10-12T17:00:00.000Z',
  participantId: 'p-1',
  itemTypeId: 't-1',
  size: '40',
  mode: 'lent',
  signature: { state: 'signed', strokes: [[[10, 20]]] },
  statementLanguage: 'ar',
};

describe('recordEquipmentHandover', () => {
  test('sends the strokes and no reason when she signed', async () => {
    const { client, calls } = buildRpcClient({
      data: [{ delivery_id: base.id, unit_code: 'B-0001', stock_after: 3 }],
    });
    const result = await recordEquipmentHandover(client, base);

    expect(calls[0]!.args).toMatchObject({
      p_id: base.id,
      p_signature_state: 'signed',
      p_signature: [[[10, 20]]],
      p_signature_reason: undefined,
      p_statement_language: 'ar',
    });
    expect(result).toEqual({ deliveryId: base.id, unitCode: 'B-0001', stockAfter: 3 });
  });

  test('sends the reason and no strokes when she refused', async () => {
    const { client, calls } = buildRpcClient({
      data: [{ delivery_id: base.id, unit_code: null, stock_after: -1 }],
    });
    await recordEquipmentHandover(client, {
      ...base,
      signature: { state: 'refused', reason: '  Did not want to  ' },
    });

    expect(calls[0]!.args.p_signature).toBeUndefined();
    expect(calls[0]!.args.p_signature_reason).toBe('Did not want to');
  });

  /**
   * The outbox keeps a refusal and retries everything else, so the code must
   * say which it is. A broken rule is VALIDATION-1, a missing right AUTH-3.
   */
  test.each([
    ['23514', 'VALIDATION-1' as const],
    ['42501', 'AUTH-3' as const],
  ])('a database refusal %s becomes %s', async (sqlState, code) => {
    const { client } = buildRpcClient({ error: { message: 'refused', code: sqlState } });
    const failure = await recordEquipmentHandover(client, base).catch((error: unknown) => error);

    expect(isAppError(failure) ? failure.code : null).toBe(code);
  });
});

describe('signatureStrokesSchema', () => {
  test('takes strokes inside the pad', () => {
    expect(
      signatureStrokesSchema.safeParse([
        [
          [0, 0],
          [1000, 1000],
        ],
      ]).success,
    ).toBe(true);
  });

  test.each([
    ['no stroke', []],
    ['an empty stroke', [[]]],
    ['a point outside the pad', [[[1001, 5]]]],
    ['a fractional point', [[[1.5, 5]]]],
  ])('refuses %s', (_label, strokes) => {
    expect(signatureStrokesSchema.safeParse(strokes).success).toBe(false);
  });

  test('refuses more points than a signature needs', () => {
    const stroke = Array.from({ length: SIGNATURE_MAX_POINTS + 1 }, () => [1, 1]);
    expect(signatureStrokesSchema.safeParse([stroke]).success).toBe(false);
  });
});

describe('awaitsReturn', () => {
  const row: ParticipantMaterialRow = {
    deliveryId: 'd-1',
    itemKey: 'boots',
    size: '40',
    mode: 'lent',
    unitCode: 'B-0001',
    deliveredOn: '2026-10-12',
    signatureState: 'signed',
    returnedAt: null,
    returnCondition: null,
  };

  test('a lent item still out awaits its return', () => {
    expect(awaitsReturn(row)).toBe(true);
  });

  test('a given item, or one already back, does not', () => {
    expect(awaitsReturn({ ...row, mode: 'given' })).toBe(false);
    expect(awaitsReturn({ ...row, returnedAt: '2026-10-13T09:00:00Z' })).toBe(false);
  });
});

describe('fetchParticipantMaterialDetail', () => {
  const row = {
    delivery_id: 'd-1',
    delivered_by_name: 'Marta Puig',
    note: null,
    signature: [
      [
        [10, 20],
        [30, 40],
      ],
    ],
    signature_state: 'signed',
    signature_reason: null,
    statement_language: 'ar',
    returned_by_name: null,
  };

  test('reads the strokes and the names', async () => {
    const { client, calls } = buildRpcClient({ data: [row] });
    const detail = await fetchParticipantMaterialDetail(client, 'd-1');
    expect(calls[0]).toEqual({
      name: 'participant_material_detail',
      args: { p_delivery_id: 'd-1' },
    });
    expect(detail).toEqual({
      deliveredByName: 'Marta Puig',
      note: null,
      strokes: [
        [
          [10, 20],
          [30, 40],
        ],
      ],
      signatureReason: null,
      statementLanguage: 'ar',
      returnedByName: null,
    });
  });

  test('unreadable strokes and an unknown language come back as null', async () => {
    const { client } = buildRpcClient({
      data: [{ ...row, signature: 'not strokes', statement_language: 'xx' }],
    });
    const detail = await fetchParticipantMaterialDetail(client, 'd-1');
    expect(detail?.strokes).toBeNull();
    expect(detail?.statementLanguage).toBeNull();
  });

  test('a handover the caller may not read is null', async () => {
    const { client } = buildRpcClient({ data: [] });
    expect(await fetchParticipantMaterialDetail(client, 'd-1')).toBeNull();
  });
});
