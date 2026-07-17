import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
