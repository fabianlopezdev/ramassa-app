/**
 * Keeps a half-answered form on the server as she walks it (RAPP-886). Pure:
 * no React, so bun tests run it.
 *
 * Each save sends the whole state she left, so saves run one after the other
 * (a later state never lands before an earlier one) and a state equal to the
 * last one kept is not sent again. Offline nothing is sent, as the form's own
 * send needs the network too: the next save once she is back online carries
 * everything she gave since. A failed save is left for the next one.
 */
import { isSameFormProgress, type CustomFormProgress } from '@ramassa/shared/intake-builder';

export interface FormProgressKeeperOptions {
  /** What the server holds now: what she resumed from, or nothing. */
  readonly kept: CustomFormProgress;
  /** Sends one state; true when the server kept it. */
  readonly save: (progress: CustomFormProgress) => Promise<boolean>;
  readonly isOnline: () => boolean;
}

export interface FormProgressKeeper {
  /** Keeps this state after any save already on its way. */
  keep(progress: CustomFormProgress): Promise<void>;
}

export function createFormProgressKeeper({
  kept,
  save,
  isOnline,
}: FormProgressKeeperOptions): FormProgressKeeper {
  let last = kept;
  let queue: Promise<void> = Promise.resolve();
  return {
    keep(progress) {
      queue = queue.then(async () => {
        if (isSameFormProgress(progress, last) || !isOnline()) return;
        if (await save(progress)) last = progress;
      });
      return queue;
    },
  };
}
