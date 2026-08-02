import { describe, expect, test } from 'bun:test';
import { AppError } from '../errors';
import { buildEquipmentDelivery } from '../testing';
import { addEquipmentDelivery, countDeliveriesByItem } from './equipment-actions';

function buildClient(options: { readonly error?: { message: string } } = {}) {
  const inserts: Record<string, unknown>[] = [];
  return {
    inserts,
    client: {
      from() {
        return {
          insert(values: Record<string, unknown>) {
            inserts.push(values);
            return Promise.resolve({ data: null, error: options.error ?? null });
          },
        };
      },
    } as never,
  };
}

describe('addEquipmentDelivery', () => {
  const base = {
    participantId: 'p-1',
    deliveredBy: 's-1',
    delivery: { item: 'boots', size: '38', deliveredOn: '2026-08-01' },
  } as const;

  test('it records who received, what, and who handed it over', async () => {
    const { client, inserts } = buildClient();
    await addEquipmentDelivery(client, base);
    expect(inserts[0]).toMatchObject({
      profile_id: 'p-1',
      delivered_by: 's-1',
      item: 'boots',
      size: '38',
      delivered_on: '2026-08-01',
    });
  });

  /**
   * An empty string is not a size. The season report groups on this column, and
   * '' would be a bucket for a size nobody wears, sitting next to the real ones
   * and looking like data.
   */
  test.each([[undefined], ['']])(
    'a size of %p is stored as null, never as an empty string',
    async (size) => {
      const { client, inserts } = buildClient();
      await addEquipmentDelivery(client, {
        ...base,
        delivery: { item: 'water_bottle', size, deliveredOn: '2026-08-01' },
      });
      expect(inserts[0]!.size).toBeNull();
    },
  );

  test('an empty note is stored as null too', async () => {
    const { client, inserts } = buildClient();
    await addEquipmentDelivery(client, {
      ...base,
      delivery: { ...base.delivery, note: '' },
    });
    expect(inserts[0]!.note).toBeNull();
  });

  test('a refusal arrives as a typed error rather than a silent success', async () => {
    const { client } = buildClient({ error: { message: 'new row violates row-level security' } });
    await expect(addEquipmentDelivery(client, base)).rejects.toBeInstanceOf(AppError);
  });
});

describe('countDeliveriesByItem', () => {
  /** The number the season report is actually asked for. */
  test('it counts each item, and omits the ones never handed out', () => {
    const counts = countDeliveriesByItem([
      buildEquipmentDelivery({ id: 'a', item: 'boots' }),
      buildEquipmentDelivery({ id: 'b', item: 'boots' }),
      buildEquipmentDelivery({ id: 'c', item: 'jersey' }),
    ]);
    expect(counts.get('boots')).toBe(2);
    expect(counts.get('jersey')).toBe(1);
    expect(counts.has('gloves')).toBe(false);
  });

  test('an empty log counts nothing rather than throwing', () => {
    expect(countDeliveriesByItem([]).size).toBe(0);
  });
});
