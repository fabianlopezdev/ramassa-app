import { describe, expect, test } from 'bun:test';
import {
  ADMIN_CLIENT_CHUNK_BUDGET_KB,
  adminManualChunks,
  injectRamassaTokensCss,
  isSentryBuildUploadEnabled,
} from './vite.config';

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

  test('splits the largest framework families out of the client entry', () => {
    expect(adminManualChunks('/repo/node_modules/@tanstack/react-router/index.js')).toBe(
      'vendor-tanstack-router',
    );
    expect(adminManualChunks('/repo/node_modules/@tanstack/react-start/index.js')).toBe(
      'vendor-tanstack-start',
    );
    expect(adminManualChunks('/repo/node_modules/@sentry/core/index.js')).toBe(
      'vendor-observability',
    );
    expect(adminManualChunks('/repo/node_modules/seroval/dist/index.mjs')).toBe(
      'vendor-tanstack-router',
    );
    expect(adminManualChunks('/repo/src/routes/dashboard.tsx')).toBeUndefined();
  });

  test('token CSS injection preserves an accurate source map chain', () => {
    const result = injectRamassaTokensCss('a { color: red; }\n/* @ramassa-tokens */', '/app.css');

    expect(result?.code).toContain('--ramassa-');
    expect(result?.map).toBeDefined();
    expect(result?.map.sources).toEqual(['/app.css']);
  });
});
