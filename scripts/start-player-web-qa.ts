/** Builds and serves the shipping Expo web export for cumulative browser QA. */

import { extname, normalize, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dir, '..');
const mobileRoot = resolve(repoRoot, 'apps/mobile');
const exportRoot = resolve(mobileRoot, 'dist');
const port = Number(process.env.RAMASSA_QA_PLAYER_PORT ?? '4194');

const build = Bun.spawn(['bunx', 'expo', 'export', '--platform', 'web'], {
  cwd: mobileRoot,
  env: process.env,
  stdout: 'inherit',
  stderr: 'inherit',
});
const buildExitCode = await build.exited;
if (buildExitCode !== 0) process.exit(buildExitCode);

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

Bun.serve({
  port,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const relativePath = normalize(pathname).replace(/^[/\\]+/, '');
    const requestedPath = resolve(exportRoot, relativePath || 'index.html');
    if (!requestedPath.startsWith(`${exportRoot}/`) && requestedPath !== exportRoot) {
      return new Response(null, { status: 403 });
    }

    const requestedFile = Bun.file(requestedPath);
    const file = (await requestedFile.exists())
      ? requestedFile
      : Bun.file(resolve(exportRoot, 'index.html'));
    const extension = extname(file.name ?? requestedPath);
    return new Response(file, {
      headers: { 'content-type': contentTypes[extension] ?? 'application/octet-stream' },
    });
  },
});

await new Promise(() => undefined);
