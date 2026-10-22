/**
 * How her dependants answer reads on a staff screen (RAPP-611). Staff can make
 * the question optional, so "no answer" exists and must never read as "no":
 *   - `count`: she has dependants, and how many;
 *   - `none`: she said no;
 *   - `unknown`: nobody answered;
 *   - `hidden`: the caller may not read Personal fields (RAPP-240), so the
 *     roster sends neither the answer nor the count.
 */
export type DependentsShown =
  | { readonly kind: 'count'; readonly count: number }
  | { readonly kind: 'none' | 'unknown' | 'hidden' };

export function dependentsShown(
  hasDependents: boolean | null | undefined,
  numDependents: number | null | undefined,
): DependentsShown {
  if (hasDependents === true) return { kind: 'count', count: numDependents ?? 0 };
  if (hasDependents === false) return { kind: 'none' };
  return numDependents === null ? { kind: 'hidden' } : { kind: 'unknown' };
}
