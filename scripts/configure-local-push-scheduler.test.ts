import { describe, expect, test } from 'bun:test';
import { createDispatchSecret } from './configure-local-push-scheduler';

describe('local push scheduler invocation secret', () => {
  test('creates independent 256-bit hexadecimal secrets', () => {
    const first = createDispatchSecret();
    const second = createDispatchSecret();

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });
});
