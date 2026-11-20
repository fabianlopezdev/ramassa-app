import { describe, expect, it } from 'bun:test';
import { countUnseenHelpItems, unopenedHelpIds } from './help-news';

describe('countUnseenHelpItems (RAPP-873)', () => {
  it('gives no numbers when she has seen every list', () => {
    const numbers = countUnseenHelpItems([]);
    expect(numbers.total).toBe(0);
    expect(numbers.countsByCategoryId).toEqual({});
  });

  it('counts each unseen item on the tile of its category and in the total', () => {
    const numbers = countUnseenHelpItems([
      { id: 'a', categoryId: 'housing' },
      { id: 'b', categoryId: 'health' },
      { id: 'c', categoryId: 'housing' },
    ]);
    expect(numbers.total).toBe(3);
    expect(numbers.countsByCategoryId).toEqual({ housing: 2, health: 1 });
  });

  it('counts an item without a category in the total and on no tile', () => {
    const numbers = countUnseenHelpItems([
      { id: 'a', categoryId: null },
      { id: 'b', categoryId: 'health' },
    ]);
    expect(numbers.total).toBe(2);
    expect(numbers.countsByCategoryId).toEqual({ health: 1 });
  });
});

describe('unopenedHelpIds (RAPP-873)', () => {
  it('marks every item she has not opened, with or without a category', () => {
    const ids = unopenedHelpIds([
      { id: 'a', categoryId: 'housing' },
      { id: 'b', categoryId: null },
    ]);
    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  it('marks nothing when she has opened everything', () => {
    expect(unopenedHelpIds([]).size).toBe(0);
  });
});
