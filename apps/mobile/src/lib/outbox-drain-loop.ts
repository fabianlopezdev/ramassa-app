/**
 * The loop every offline sync worker runs while the phone is online (RAPP-530).
 *
 * It drains at once, then again at the outbox's next retry time, and also on a
 * steady tick. The tick matters: a screen may drain on its own (a signing or a
 * handover sends at once), and when that send fails the outbox records a retry
 * time that no timer of the worker knows about. Without the tick, the entry
 * waited for the next reconnect or app start, which never came while the
 * phone kept its network. A drain with nothing due sends nothing.
 */

const DRAIN_TICK_MS = 15_000;

interface Timers {
  readonly setTimeout: (run: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly setInterval: (run: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
  readonly now: () => number;
}

const realTimers: Timers = {
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (run, ms) => setInterval(run, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  now: () => Date.now(),
};

/**
 * A screen that sends at once waits at most this long for the answer, then
 * says the change is saved on the phone. The send carries on in the outbox.
 */
export const SCREEN_SEND_WAIT_MS = 5_000;

/** True when the work finished within `ms`; it keeps running either way. */
export async function finishesWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const done = work.then(
    () => true as const,
    () => true as const,
  );
  try {
    return await Promise.race([done, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Starts the loop; the returned function stops it. */
export function startDrainLoop(
  drain: () => Promise<{ readonly nextRetryAt: string | null }>,
  timers: Timers = realTimers,
  tickMs: number = DRAIN_TICK_MS,
): () => void {
  let stopped = false;
  let retryTimer: unknown;
  const run = async () => {
    if (stopped) return;
    try {
      const { nextRetryAt } = await drain();
      if (stopped || nextRetryAt === null) return;
      timers.clearTimeout(retryTimer);
      retryTimer = timers.setTimeout(
        () => void run(),
        Math.max(0, Date.parse(nextRetryAt) - timers.now()),
      );
    } catch {
      // A drain never throws for a send; the tick tries again.
    }
  };
  void run();
  const tick = timers.setInterval(() => void run(), tickMs);
  return () => {
    stopped = true;
    timers.clearTimeout(retryTimer);
    timers.clearInterval(tick);
  };
}
