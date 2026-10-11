import type { AppErrorCode } from './runtime';

/**
 * The error code for a failed database call. A risky action refused for want of
 * a recent authenticator code (RAPP-235) is AUTH-9, so the screen can ask for
 * the code; everything else is DB-1.
 */
export function databaseErrorCode(message: string): AppErrorCode {
  return message.startsWith('step_up_required') ? 'AUTH-9' : 'DB-1';
}
