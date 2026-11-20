import { describe, expect, it } from 'bun:test';
import { summarizeHelpNews } from './help-news';

describe('summarizeHelpNews (RAPP-873)', () => {
  it('gives nothing for an empty list', () => {
    const summary = summarizeHelpNews([]);
    expect(summary.total).toBe(0);
    expect(summary.countsByCategoryId).toEqual({});
    expect(summary.newIds.size).toBe(0);
  });

  it('counts each new item on its own category', () => {
    const summary = summarizeHelpNews([
      { id: 'a', categoryId: 'housing' },
      { id: 'b', categoryId: 'health' },
      { id: 'c', categoryId: 'housing' },
    ]);
    expect(summary.total).toBe(3);
    expect(summary.countsByCategoryId).toEqual({ housing: 2, health: 1 });
    expect([...summary.newIds].sort()).toEqual(['a', 'b', 'c']);
  });

  it('counts an item without a category in the total and the set, and on no tile', () => {
    const summary = summarizeHelpNews([
      { id: 'a', categoryId: null },
      { id: 'b', categoryId: 'health' },
    ]);
    expect(summary.total).toBe(2);
    expect(summary.countsByCategoryId).toEqual({ health: 1 });
    expect(summary.newIds.has('a')).toBe(true);
    expect(summary.newIds.has('b')).toBe(true);
  });
});
