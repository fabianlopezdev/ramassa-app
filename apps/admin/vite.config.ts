import { fileURLToPath } from 'node:url';
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { tokens, tokensToCssVariables } from '@ramassa/shared/tokens';

const TOKENS_MARKER = '/* @ramassa-tokens */';

// Injects the shared design tokens (ADR-015) into the admin stylesheet as
// --ramassa-* CSS custom properties, generated from packages/shared/tokens. Runs
// before @tailwindcss/vite so the shadcn brand variables that reference them are
// resolved during the Tailwind build. Single source of truth: change a token and
// both the admin and the mobile theme change.
function ramassaTokensCss(): Plugin {
  return {
    name: 'ramassa-tokens-css',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('app.css') || !code.includes(TOKENS_MARKER)) return null;
      return { code: code.replace(TOKENS_MARKER, tokensToCssVariables(tokens)), map: null };
    },
  };
}

// Deployment target is Cloudflare Workers (ADR-016). The @cloudflare/vite-plugin
// and wrangler.jsonc are wired in RAPP-15; until then this config is dev-only.
export default defineConfig({
  server: {
    port: 3000,
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
    tanstackStart(),
    viteReact(),
    // Source-map upload (RAPP-12): active only when SENTRY_AUTH_TOKEN is set
    // (release builds); local dev and CI build without it.
    sentryTanstackStart({
      org: 'fabulous-apps',
      project: 'ramassa-admin',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
    }),
  ],
});
