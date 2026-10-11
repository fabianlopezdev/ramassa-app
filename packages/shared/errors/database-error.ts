import type { AppErrorCode } from './runtime';

/**
 * The error code for a failed database call.
 *
 * A risky action refused for want of a recent authenticator code (RAPP-235) is
 * AUTH-9, so the screen can ask for the code. When the caller passes the
 * PostgreSQL error code, a refusal is told apart from a failure that may pass
 * (RAPP-237): the offline outbox keeps a refused change visible instead of
 * retrying it forever.
 *
 *   42501         no permission, or row security said no  -> AUTH-3
 *   P0002         the record is not there                 -> DB-2
 *   22xxx, 23xxx  the data breaks a rule                  -> VALIDATION-1
 *   P0001         a rule in a function said no            -> VALIDATION-1
 *   anything else (network, timeout, server)              -> DB-1
 */
export function databaseErrorCode(message: string, sqlState?: string | null): AppErrorCode {
  if (message.startsWith('step_up_required')) return 'AUTH-9';
  if (sqlState === '42501') return 'AUTH-3';
  if (sqlState === 'P0002') return 'DB-2';
  if (sqlState === 'P0001' || sqlState?.startsWith('22') || sqlState?.startsWith('23')) {
    return 'VALIDATION-1';
  }
  return 'DB-1';
}
