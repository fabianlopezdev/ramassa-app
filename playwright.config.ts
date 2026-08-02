import { defineConfig } from '@playwright/test';

/**
 * The web QA suite (RAPP-99): the admin app's equivalent of the Maestro
 * regression suite the phone app has had since RAPP-20.
 *
 *   bun run qa:web
 *
 * It drives a REAL browser against the admin running on the seeded local
 * stack, because the failure it exists to prevent is a screen that passes
 * every unit test and pgTAP assertion while being broken for the person using
 * it. Specs are cumulative: every new admin screen adds to this suite rather
 * than starting its own.
 */
export default defineConfig({
  testDir: './scripts/qa-web',
  // NOT `*.spec.ts`: `bun test` claims that suffix too, and would try to run
  // these browser specs in-process and fail with a confusing Playwright error.
  // The suffix is the boundary between the two runners.
  testMatch: '**/*.web-qa.ts',
  // Serial by default: the suite shares one seeded database, and two specs
  // filtering the same roster at once is how a flaky suite is born.
  workers: 1,
  fullyParallel: false,
  // A retry hides exactly the intermittent failure worth reading. The suite is
  // small enough that a re-run is cheap when a failure is genuinely a flake.
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    locale: 'en-GB',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Its OWN server, on its own port, never reused.
      //
      // The first version reused whatever was already on :3000, and the suite
      // then passed against a deliberately broken build: Vite had the shared
      // package pre-bundled from before the change, so the specs exercised code
      // that no longer existed on disk. A suite that tests a stale bundle is the
      // exact failure it was written to prevent, one level up.
      //
      // Port 3100 also keeps it clear of the dev server a person has open while
      // the suite runs.
      command: 'bun run --cwd apps/admin dev -- --port 3100 --strictPort --force',
      url: 'http://localhost:3100',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // The media Worker, because erasing a participant is TWO systems and the
      // suite is here to prove the whole act (RAPP-26). Postgres refuses to
      // delete her record without a receipt this Worker writes, so a suite that
      // ran without it could only ever assert the refusal.
      //
      // `--port 8787` matches EXPO_PUBLIC_MEDIA_WORKER_URL in the admin's env,
      // which Vite inlines at build time, and 3100 is in the Worker's CORS
      // allowlist for the same reason.
      command: 'bun run --cwd workers/media dev -- --port 8787',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
