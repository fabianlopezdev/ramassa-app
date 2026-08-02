/**
 * Which failures are worth trying again (RAPP-12 taxonomy, contract rule 7).
 *
 * The audience is on low-end Android over patchy mobile data, so retrying is
 * usually right: the same request a second later often just works. What is
 * never right is retrying a failure whose answer cannot change. An expired
 * session is still expired on the second attempt, a rejected input is still
 * rejected, and a record that does not exist does not start existing. Retrying
 * those costs the two things this audience has least of: time in front of a
 * frozen screen, and mobile data.
 *
 * Lives beside the registry rather than in either app because it is a statement
 * about the CODES, and the admin's retry policy has to agree with the phone's.
 */

import { toAppError } from './app-error';
import type { ErrorDomain } from './codes';

/**
 * Domains where a second attempt asks a question that has already been
 * answered. AUTH failures need a new session, not a new request; VALIDATION
 * failures need different input.
 */
const NON_RETRYABLE_DOMAINS: readonly ErrorDomain[] = ['AUTH', 'VALIDATION'];

/**
 * `DB-2` is "not found", which is an ANSWER rather than a failure to get one.
 * The rest of the DB domain (a dropped connection mid-query) is worth retrying,
 * which is why this is a code and not a whole domain.
 */
const NON_RETRYABLE_CODES = ['DB-2'] as const;

export function isRetryableError(error: unknown): boolean {
  const appError = toAppError(error);
  if (NON_RETRYABLE_DOMAINS.includes(appError.domain)) {
    return false;
  }
  return !NON_RETRYABLE_CODES.some((code) => code === appError.code);
}
