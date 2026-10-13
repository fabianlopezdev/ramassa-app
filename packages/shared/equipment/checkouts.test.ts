import { describe, expect, test } from 'bun:test';
import { recordStaffCheckin, returnDateIn } from './checkouts';

describe('returnDateIn', () => {
  test('counts days on the Madrid calendar', () => {
    // 21:30 UTC is 23:30 in Madrid, still the 12th.
    expect(returnDateIn(1, new Date('2026-10-12T21:30:00Z'))).toBe('2026-10-13');
    // 22:30 UTC is 00:30 on the 13th in Madrid.
    expect(returnDateIn(1, new Date('2026-10-12T22:30:00Z'))).toBe('2026-10-14');
  });

  test('crosses months and years', () => {
    expect(returnDateIn(7, new Date('2026-12-28T10:00:00Z'))).toBe('2027-01-04');
  });
});

describe('recordStaffCheckin', () => {
  test('nothing back sends no condition', async () => {
    const calls: Record<string, unknown>[] = [];
    const client = {
      rpc(_name: string, args: Record<string, unknown>) {
        calls.push(args);
        return Promise.resolve({ data: null, error: null });
      },
    } as never;
    await recordStaffCheckin(client, { checkoutId: 'c-1', returned: 0, condition: 'good' });

    expect(calls[0]).toEqual({ p_checkout_id: 'c-1', p_returned: 0, p_condition: undefined });
  });
});
