import { describe, expect, test } from 'bun:test';
import { stockItemRows, type StockItemType } from './stock-items';

const type = (key: string, sizes: readonly string[], isActive = true): StockItemType => ({
  id: `id-${key}`,
  key,
  sizes,
  is_active: isActive,
});

const label = (key: string) => key.toUpperCase();

describe('stockItemRows (RAPP-800)', () => {
  test('lists every active item, with or without stock, by label', () => {
    const rows = stockItemRows({
      types: [type('shirt', ['S', 'M']), type('ball', [])],
      levels: [{ itemKey: 'shirt', size: 'M', quantity: 3 }],
      label,
      locale: 'ca',
      includeInactive: false,
    });
    expect(rows.map((row) => row.itemKey)).toEqual(['ball', 'shirt']);
    expect(rows[0]?.sizes).toEqual([]);
    expect(rows[1]?.typeId).toBe('id-shirt');
  });

  test('orders sizes by the item own order, unknown sizes last', () => {
    const rows = stockItemRows({
      types: [type('shirt', ['XS', 'S', 'M', 'L'])],
      levels: [
        { itemKey: 'shirt', size: 'XL', quantity: 1 },
        { itemKey: 'shirt', size: 'M', quantity: 2 },
        { itemKey: 'shirt', size: 'XS', quantity: 4 },
      ],
      label,
      locale: 'ca',
      includeInactive: false,
    });
    expect(rows[0]?.sizes.map((level) => level.size)).toEqual(['XS', 'M', 'XL']);
  });

  test('keeps stock of an item with no type, without an editor', () => {
    const rows = stockItemRows({
      types: [],
      levels: [{ itemKey: 'legacy', size: null, quantity: 2 }],
      label,
      locale: 'ca',
      includeInactive: true,
    });
    expect(rows).toEqual([
      {
        itemKey: 'legacy',
        label: 'LEGACY',
        typeId: null,
        isActive: true,
        sizes: [{ itemKey: 'legacy', size: null, quantity: 2 }],
      },
    ]);
  });

  test('switched-off items show only for item editors, and last', () => {
    const input = {
      types: [type('apron', [], false), type('ball', [])],
      levels: [],
      label,
      locale: 'ca',
    };
    expect(stockItemRows({ ...input, includeInactive: false }).map((row) => row.itemKey)).toEqual([
      'ball',
    ]);
    expect(stockItemRows({ ...input, includeInactive: true }).map((row) => row.itemKey)).toEqual([
      'ball',
      'apron',
    ]);
  });

  test('a switched-off item that still has stock always shows', () => {
    const rows = stockItemRows({
      types: [type('apron', [], false)],
      levels: [{ itemKey: 'apron', size: null, quantity: 1 }],
      label,
      locale: 'ca',
      includeInactive: false,
    });
    expect(rows.map((row) => [row.itemKey, row.isActive])).toEqual([['apron', false]]);
  });
});
