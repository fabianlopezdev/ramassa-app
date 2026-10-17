import { expect, test } from 'bun:test';
import { SEED_TOTP_SECRET } from '@ramassa/shared/testing';
import { totpCode as maestroTotpCode } from '../.maestro/totp.js';
import { totpCode as webTotpCode } from '../scripts/qa-web/totp';

// The Maestro script carries its own SHA-1 because Maestro's script engine has
// no crypto module. It must give the code the web QA helper gives, which uses
// node:crypto, or the phone flows fail at the second factor for no visible
// reason.

test('the Maestro authenticator code matches the web QA helper', () => {
  const start = Date.UTC(2026, 9, 16, 12, 0, 0);
  for (let step = 0; step < 500; step += 1) {
    const at = start + step * 30_000 + 7_000;
    expect(maestroTotpCode(SEED_TOTP_SECRET, at)).toBe(webTotpCode(SEED_TOTP_SECRET, at));
  }
});

test('the Maestro authenticator code matches the RFC 6238 SHA-1 vectors', () => {
  // RFC 6238 appendix B, secret "12345678901234567890", last six digits.
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  expect(maestroTotpCode(secret, 59_000)).toBe('287082');
  expect(maestroTotpCode(secret, 1_111_111_109_000)).toBe('081804');
  expect(maestroTotpCode(secret, 1_234_567_890_000)).toBe('005924');
  expect(maestroTotpCode(secret, 2_000_000_000_000)).toBe('279037');
});
