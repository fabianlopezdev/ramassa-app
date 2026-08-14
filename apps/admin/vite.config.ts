import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import MagicString from 'magic-string';
import { defineConfig, type Plugin } from 'vite';
import { tokens, tokensToCssVariables } from '@ramassa/shared/tokens';

const TOKENS_MARKER = '/* @ramassa-tokens */';

// The current client entry is about 1,216 kB uncompressed and 379 kB gzip.
// Keep a narrow, explicit ceiling so ordinary builds stay quiet while future
// bundle growth still fails the closure gate with a warning.
export const ADMIN_CLIENT_CHUNK_BUDGET_KB = 1_250;

export function adminManualChunks(moduleId: string): string | undefined {
  if (!moduleId.includes('/node_modules/')) return undefined;
  if (
    moduleId.includes('/seroval') ||
    moduleId.includes('/@tanstack/react-router/') ||
    moduleId.includes('/@tanstack/router-core/') ||
    moduleId.includes('/@tanstack/history/') ||
    moduleId.includes('/@tanstack/react-store/') ||
    moduleId.includes('/@tanstack/store/')
  ) {
    return 'vendor-tanstack-router';
  }
  if (moduleId.includes('/@tanstack/')) {
    return 'vendor-tanstack-start';
  }
  if (moduleId.includes('/@sentry/') || moduleId.includes('/@apm-js-collab/')) {
    return 'vendor-observability';
  }
  return undefined;
}

export function isSentryBuildUploadEnabled(authToken: string | undefined): boolean {
  return authToken?.trim() !== '' && authToken !== undefined;
}

// Injects the shared design tokens (ADR-015) into the admin stylesheet as
// --ramassa-* CSS custom properties, generated from packages/shared/tokens. Runs
// before @tailwindcss/vite so the shadcn brand variables that reference them are
// resolved during the Tailwind build. Single source of truth: change a token and
// both the admin and the mobile theme change.
export function injectRamassaTokensCss(code: string, id: string) {
  if (!id.includes('app.css') || !code.includes(TOKENS_MARKER)) return null;
  const transformed = new MagicString(code);
  const markerStart = code.indexOf(TOKENS_MARKER);
  transformed.overwrite(
    markerStart,
    markerStart + TOKENS_MARKER.length,
    tokensToCssVariables(tokens),
  );
  return {
    code: transformed.toString(),
    map: transformed.generateMap({ hires: true, source: id, includeContent: true }),
  };
}

function ramassaTokensCss(): Plugin {
  return {
    name: 'ramassa-tokens-css',
    enforce: 'pre',
    transform(code, id) {
      return injectRamassaTokensCss(code, id);
    },
  };
}

// Deployment target is Cloudflare Workers (ADR-016), wired natively through
// @cloudflare/vite-plugin + wrangler.jsonc (RAPP-15) with no adapter layer.
// `vite build` emits the Worker; `wrangler deploy` ships it.
export default defineConfig({
  // Expose the shared `EXPO_PUBLIC_*` Supabase vars (plus the default `VITE_*`)
  // to `import.meta.env`, so the admin validates the SAME client env schema the
  // mobile app does (RAPP-13). Server-only secrets carry neither prefix and stay
  // out of the client bundle by construction.
  envPrefix: ['VITE_', 'EXPO_PUBLIC_'],
  server: {
    port: 3000,
  },
  build: {
    chunkSizeWarningLimit: ADMIN_CLIENT_CHUNK_BUDGET_KB,
    rollupOptions: {
      output: {
        manualChunks: adminManualChunks,
      },
    },
  },
  resolve: {
    // The docs' `resolve.tsconfigPaths: true` requires a newer Vite than 7.x;
    // mirror the tsconfig "@/*" path manually until the repo moves to Vite 8+.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    ramassaTokensCss(),
    tailwindcss(),
    // `viteEnvironment: { name: 'ssr' }` tells the Cloudflare plugin to run
    // TanStack Start's SSR environment on Workers (official hosting guide).
    // It goes before tanstackStart() per that guide.
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
    // Source-map upload (RAPP-12): active only when SENTRY_AUTH_TOKEN is set
    // (release builds); local dev and CI build without it.
    sentryTanstackStart({
      org: 'fabulous-apps',
      // Must match the Sentry project slug exactly or source-map upload 400s
      // (verified via a real sentry-cli sourcemaps upload, RAPP-12).
      project: 'ramassa-admin',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !isSentryBuildUploadEnabled(process.env.SENTRY_AUTH_TOKEN),
      sourcemaps: {
        disable: !isSentryBuildUploadEnabled(process.env.SENTRY_AUTH_TOKEN),
      },
      telemetry: false,
    }),
  ],
});
