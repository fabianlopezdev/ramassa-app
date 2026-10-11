import { describe, expect, test } from 'bun:test';
import { databaseErrorCode } from './database-error';

describe('databaseErrorCode', () => {
  test('a refusal is told apart from a failure that may pass', () => {
    expect(databaseErrorCode('new row violates row-level security policy', '42501')).toBe('AUTH-3');
    expect(databaseErrorCode('not found', 'P0002')).toBe('DB-2');
    expect(databaseErrorCode('ATTENDANCE/PARTICIPANT_REQUIRED', '23514')).toBe('VALIDATION-1');
    expect(databaseErrorCode('message is not writable', 'P0001')).toBe('VALIDATION-1');
    expect(databaseErrorCode('invalid input syntax', '22P02')).toBe('VALIDATION-1');
  });

  test('the step-up refusal wins, and without a code everything else is DB-1', () => {
    expect(databaseErrorCode('step_up_required', '42501')).toBe('AUTH-9');
    expect(databaseErrorCode('connection reset')).toBe('DB-1');
    expect(databaseErrorCode('JWT expired', 'PGRST301')).toBe('DB-1');
  });
});
