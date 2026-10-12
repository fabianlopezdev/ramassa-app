import { describe, expect, test } from 'bun:test';
import {
  centsToEuroText,
  parseEuroCents,
  recordEquipmentArrival,
  type ArrivalInput,
} from './arrivals';

describe('parseEuroCents', () => {
  test.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.50', 1250],
    ['1.234,50', 123450],
    ['1.234', 123400],
    [' 7 € ', 700],
    ['0', 0],
  ])('%p is %p cents', (text, cents) => {
    expect(parseEuroCents(text)).toBe(cents);
  });

  test.each([[''], ['abc'], ['-3'], ['1,234'.replace(',', ',,')], ['12,505']])(
    '%p is not a price',
    (text) => {
      expect(parseEuroCents(text)).toBeNull();
    },
  );
});

describe('centsToEuroText', () => {
  test('writes cents the way a person types them back', () => {
    expect(centsToEuroText(2500)).toBe('25');
    expect(centsToEuroText(1250)).toBe('12,50');
    expect(centsToEuroText(null)).toBe('');
    expect(parseEuroCents(centsToEuroText(1205))).toBe(1205);
  });
});

describe('recordEquipmentArrival', () => {
  const base: ArrivalInput = {
    id: 'a-1',
    receivedAt: '2026-10-12T10:00:00.000Z',
    source: 'donation',
    sourceName: '  CF Vic ',
    problems: '',
    totalCostCents: 5000,
    lines: [{ itemTypeId: 't-1', size: '40', quantity: 3, unitValueCents: null }],
    photos: [{ objectKey: 'org/stock/u/2026/10/x.jpg', kind: 'goods' }],
  };

  function client() {
    const calls: Record<string, unknown>[] = [];
    return {
      calls,
      value: {
        rpc(_name: string, args: Record<string, unknown>) {
          calls.push(args);
          return Promise.resolve({ data: 'a-1', error: null });
        },
      } as never,
    };
  }

  test('a donation sends no cost and lets the database value its lines', async () => {
    const { calls, value } = client();
    await recordEquipmentArrival(value, base);

    expect(calls[0]).toMatchObject({
      p_source_name: 'CF Vic',
      p_problems: undefined,
      p_total_cost_cents: undefined,
      p_lines: [{ item_type_id: 't-1', size: '40', quantity: 3, unit_value_cents: null }],
      p_photos: [{ object_key: 'org/stock/u/2026/10/x.jpg', kind: 'goods' }],
    });
  });

  test('a purchase sends its total cost', async () => {
    const { calls, value } = client();
    await recordEquipmentArrival(value, { ...base, source: 'purchase' });

    expect(calls[0]!.p_total_cost_cents).toBe(5000);
  });
});
