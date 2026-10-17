/**
 * What an interrupted QA run must undo (RAPP-500).
 *
 * A run owns child processes (Metro, one Maestro per shard), booted simulators
 * and the run lock. Ctrl-C used to exit the script and leave all of them
 * behind: Metro holding its port, Maestro still driving a simulator, and the
 * lock blocking the next run. Each owner registers its undo here, and a signal
 * runs them all before the process exits.
 */

type Cleanup = () => Promise<void> | void;

const cleanups = new Set<Cleanup>();
let installed = false;

/** Registers an undo for an interrupt; returns its unregister. */
export function onInterrupt(cleanup: Cleanup): () => void {
  cleanups.add(cleanup);
  if (!installed) {
    installed = true;
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        void (async () => {
          await Promise.allSettled([...cleanups].map(async (undo) => await undo()));
          process.exit(130);
        })();
      });
    }
  }
  return () => {
    cleanups.delete(cleanup);
  };
}
