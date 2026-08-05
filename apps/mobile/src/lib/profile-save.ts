/**
 * What happens when a profile save SETTLES (RAPP-22).
 *
 * Extracted from the edit screen so the decision can be exercised against the
 * real React Query mutation lifecycle in a test. The screen renders React
 * Native, which this repo's test runner cannot mount; the policy that decides
 * whether the woman keeps her screen is too important to be covered only by a
 * human looking at it.
 *
 * The rule this file exists to hold: LEAVING THE SCREEN IS A SUCCESS SIGNAL.
 * A save that failed must keep her where she is, with her edits and a message,
 * because the alternative is a silent failure on the one screen whose whole job
 * is making sure the organization can still reach her.
 */

import type { MutateOptions } from '@tanstack/react-query';
import type { KeepStateOptions } from 'react-hook-form';

/**
 * What survives when the cached row underneath the edit form changes.
 *
 * The other half of the rule above, and the half that is easy to lose. The form
 * is fed from the React Query cache (`values`), the save paints the new values
 * into that cache optimistically, and a failed write puts the STORED ones back.
 * react-hook-form resets the form whenever those values change, so without
 * `keepDirtyValues` the rollback quietly wipes every field she edited: the
 * screen would keep her here, as intended, and show her a message about work it
 * had already thrown away.
 *
 * `keepDirtyValues` keeps the fields SHE touched and takes the fresh row for
 * the ones she did not, which is also the right answer for a background refetch
 * landing mid-edit.
 *
 * Lives here rather than in the screen so the behaviour is exercisable: the
 * screen renders React Native, this is a plain object, and the test beside this
 * file drives it through a real `useForm`.
 */
export const profileFormResetOptions: KeepStateOptions = { keepDirtyValues: true };

export interface ProfileSaveOutcome {
  /** The server accepted the write. Confirm it and leave. */
  readonly onSaved: () => void;
  /**
   * The write failed and the cache rolled back. Stay, and say so. The raw
   * failure is handed over rather than a boolean so the screen can name it
   * through the taxonomy: a message with no code is not reportable, and the
   * code is also what picks the shake's haptic.
   */
  readonly onFailed: (error: unknown) => void;
}

export function profileSaveCallbacks<TData, TError, TVariables, TContext>(
  outcome: ProfileSaveOutcome,
): MutateOptions<TData, TError, TVariables, TContext> {
  // Deliberately NOT `onSettled`, which runs on both paths. That is the whole
  // bug this module was extracted to hold still: `onSettled: () => router.back()`
  // popped the screen before its own failure message could render, so a save
  // that never reached the server was indistinguishable from one that did.
  return {
    onSuccess: () => outcome.onSaved(),
    onError: (error) => outcome.onFailed(error),
  };
}
