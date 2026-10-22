import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import MagicString from 'magic-string';
import { defineConfig, type Plugin } from 'vite';
import { tokens, tokensToCssVariables } from '@ramassa/shared/tokens';

const TOKENS_MARKER = '/* @ramassa-tokens */';

// Keep an explicit ceiling so future bundle growth remains visible.
// Supabase has its own shared chunk so the Start entry stays within budget.
export const ADMIN_CLIENT_CHUNK_BUDGET_KB = 1_250;

export function adminManualChunks(moduleId: string): string | undefined {
  if (!moduleId.includes('/node_modules/')) return undefined;
  if (moduleId.includes('/@supabase/')) return 'vendor-supabase';
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

export function isViteCssPostSourcemapDiagnostic(log: {
  readonly code?: string;
  readonly plugin?: string;
}): boolean {
  return log.code === 'SOURCEMAP_BROKEN' && log.plugin === 'vite:css-post';
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
    rolldownOptions: {
      onLog(level, log, handler) {
        // Vite reports its own empty CSS module map when release maps are
        // enabled. Project transforms still provide real maps and are tested.
        if (isViteCssPostSourcemapDiagnostic(log)) return;
        handler(level, log);
      },
      output: {
        // Vite 8 bundles with Rolldown, whose manual split is a code-splitting
        // group (RAPP-437). A module the function names nothing for stays in
        // the automatic split, as with Rollup's manualChunks before.
        codeSplitting: { groups: [{ name: adminManualChunks }] },
      },
    },
  },
  resolve: {
    // Vite 8 reads the tsconfig "@/*" path itself (RAPP-437).
    tsconfigPaths: true,
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
        // The Cloudflare plugin writes Worker source maps into dist/server and
        // tells wrangler to upload them, which fails if one is missing (RAPP-623,
        // https://developers.cloudflare.com/workers/observability/source-maps/).
        // Sentry deletes every .map by default, so delete only the public client
        // maps (https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/sourcemaps/).
        filesToDeleteAfterUpload: ['./dist/client/**/*.map'],
      },
      telemetry: false,
    }),
  ],
});
