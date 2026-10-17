import { expect, test } from 'bun:test';
import { startDrainLoop } from './outbox-drain-loop';

function fakeTimers() {
  let now = 0;
  let next = 1;
  const timeouts = new Map<number, { at: number; run: () => void }>();
  const intervals = new Map<number, { every: number; last: number; run: () => void }>();
  return {
    timers: {
      setTimeout: (run: () => void, ms: number) => {
        const id = next++;
        timeouts.set(id, { at: now + ms, run });
        return id;
      },
      clearTimeout: (id: unknown) => void timeouts.delete(id as number),
      setInterval: (run: () => void, ms: number) => {
        const id = next++;
        intervals.set(id, { every: ms, last: now, run });
        return id;
      },
      clearInterval: (id: unknown) => void intervals.delete(id as number),
      now: () => now,
    },
    async advance(ms: number) {
      const end = now + ms;
      while (now < end) {
        now += 1000;
        for (const [id, timer] of [...timeouts]) {
          if (timer.at <= now) {
            timeouts.delete(id);
            timer.run();
          }
        }
        for (const timer of intervals.values()) {
          if (now - timer.last >= timer.every) {
            timer.last = now;
            timer.run();
          }
        }
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
}

test('drains at once, at the retry time, and on the steady tick', async () => {
  const clock = fakeTimers();
  const drains: number[] = [];
  const stop = startDrainLoop(
    async () => {
      drains.push(clock.timers.now());
      // The first drain fails and asks for a retry in 5 seconds.
      return { nextRetryAt: drains.length === 1 ? new Date(5000).toISOString() : null };
    },
    clock.timers,
    15_000,
  );
  await clock.advance(16_000);
  expect(drains).toEqual([0, 5000, 15_000]);
  stop();
});

test('a retry time recorded by someone else is still picked up by the tick', async () => {
  const clock = fakeTimers();
  let due = false;
  let sent = 0;
  const stop = startDrainLoop(
    async () => {
      if (due) {
        sent += 1;
        due = false;
      }
      return { nextRetryAt: null };
    },
    clock.timers,
    15_000,
  );
  // A screen's own send failed: the entry is due again, and the worker set no timer.
  due = true;
  await clock.advance(15_000);
  expect(sent).toBe(1);
  stop();
  due = true;
  await clock.advance(30_000);
  expect(sent).toBe(1);
});

test('a screen stops waiting after the limit, and the work carries on', async () => {
  const { finishesWithin } = await import('./outbox-drain-loop');
  let finished = false;
  const slow = new Promise<void>((resolve) =>
    setTimeout(() => {
      finished = true;
      resolve();
    }, 60),
  );
  expect(await finishesWithin(slow, 10)).toBe(false);
  expect(finished).toBe(false);
  await slow;
  expect(finished).toBe(true);
  expect(await finishesWithin(Promise.resolve(), 50)).toBe(true);
  expect(await finishesWithin(Promise.reject(new Error('refused')), 50)).toBe(true);
});
