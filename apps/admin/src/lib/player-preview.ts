/**
 * "Preview as player" from the web admin (RAPP-372, ADR-027). The tab with the
 * player web app opens at once, inside the click, so the browser allows it.
 * Then the database checks that she is a team member with a verified second
 * factor and returns the preview account's address and a new password, with
 * her own session. They go to the tab with `postMessage`, to the player origin
 * only, once the tab says it is ready. Her own session in the admin is
 * untouched, and the tab closes when the preview ends.
 */
import { safeAsync } from '@/lib/observability';
import { adminClientEnv, supabase } from '@/lib/supabase';
import {
  originOf,
  PLAYER_PREVIEW_HANDOFF,
  PLAYER_PREVIEW_HANDOFF_PATH,
  PLAYER_PREVIEW_READY,
  startPlayerPreview,
  type PlayerPreviewHandoff,
} from '@ramassa/shared/auth';
import { AppError, type Result } from '@ramassa/shared/errors';

const READY_TIMEOUT_MS = 30_000;

export function isPlayerPreviewAvailable(): boolean {
  return adminClientEnv.EXPO_PUBLIC_PLAYER_WEB_URL !== undefined;
}

function waitForReady(tab: Window, playerOrigin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', receive);
      reject(new AppError('NETWORK-1', { message: 'The player tab did not answer' }));
    }, READY_TIMEOUT_MS);
    function receive(event: MessageEvent) {
      const data = event.data as { readonly type?: unknown } | null;
      if (event.origin !== playerOrigin || event.source !== tab) return;
      if (data?.type !== PLAYER_PREVIEW_READY) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', receive);
      resolve();
    }
    window.addEventListener('message', receive);
  });
}

/** Opens the player web app as the preview account, on `target` when given. */
export function openPlayerPreview(target: string | null): Promise<Result<void, AppError>> {
  const playerUrl = adminClientEnv.EXPO_PUBLIC_PLAYER_WEB_URL;
  const tab =
    playerUrl === undefined
      ? null
      : window.open(new URL(PLAYER_PREVIEW_HANDOFF_PATH, playerUrl).toString(), '_blank');
  return safeAsync(
    async () => {
      if (playerUrl === undefined || tab === null) {
        throw new AppError('UNEXPECTED-1', { message: 'The player tab could not open' });
      }
      const playerOrigin = originOf(playerUrl);
      const ready = waitForReady(tab, playerOrigin);
      try {
        const credentials = await startPlayerPreview(supabase);
        await ready;
        const handoff: PlayerPreviewHandoff = { type: PLAYER_PREVIEW_HANDOFF, credentials, target };
        tab.postMessage(handoff, playerOrigin);
      } catch (error) {
        tab.close();
        throw error;
      }
    },
    { code: 'AUTH-1', context: { operation: 'open-player-preview' } },
  );
}
