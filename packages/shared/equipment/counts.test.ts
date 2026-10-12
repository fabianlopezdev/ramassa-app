import { describe, expect, test } from 'bun:test';
import { countDifferences, recordStockCount } from './counts';

describe('countDifferences', () => {
  test('lists only the sizes where the shelf and the ledger disagree', () => {
    const expected = new Map<string | null, number>([
      ['S', 6],
      ['XL', -1],
    ]);
    expect(
      countDifferences(
        [
          { size: 'S', counted: 6 },
          { size: 'M', counted: 0 },
          { size: 'XL', counted: 2 },
        ],
        expected,
      ),
    ).toEqual([{ size: 'XL', expected: -1, counted: 2 }]);
  });

  test('a size with no movement is expected at 0', () => {
    expect(countDifferences([{ size: null, counted: 3 }], new Map())).toEqual([
      { size: null, expected: 0, counted: 3 },
    ]);
  });
});

describe('recordStockCount', () => {
  test('sends no reason when nothing differs, and a trimmed note', async () => {
    const calls: Record<string, unknown>[] = [];
    const client = {
      rpc(_name: string, args: Record<string, unknown>) {
        calls.push(args);
        return Promise.resolve({ data: [{ count_id: 'c-1', corrections: 0 }], error: null });
      },
    } as never;
    const result = await recordStockCount(client, {
      id: 'c-1',
      itemTypeId: 't-1',
      lines: [{ size: null, counted: 12 }],
      reason: null,
      note: '  ',
    });

    expect(calls[0]).toMatchObject({ p_reason: undefined, p_note: undefined });
    expect(result.corrections).toBe(0);
  });
});
