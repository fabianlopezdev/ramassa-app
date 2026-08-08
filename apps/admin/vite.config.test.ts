import { describe, expect, test } from 'bun:test';
import { ADMIN_CLIENT_CHUNK_BUDGET_KB, isSentryBuildUploadEnabled } from './vite.config';

describe('admin production build configuration', () => {
  test('keeps the current client bundle inside an explicit growth budget', () => {
    expect(ADMIN_CLIENT_CHUNK_BUDGET_KB).toBe(1_250);
  });

  test('enables Sentry build upload only when a non-empty token exists', () => {
    expect(isSentryBuildUploadEnabled(undefined)).toBe(false);
    expect(isSentryBuildUploadEnabled('')).toBe(false);
    expect(isSentryBuildUploadEnabled('   ')).toBe(false);
    expect(isSentryBuildUploadEnabled('configured')).toBe(true);
  });
});
