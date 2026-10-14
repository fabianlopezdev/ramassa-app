/**
 * Starting and leaving the player preview (RAPP-371, ADR-027).
 *
 * Starting asks the database for the preview account's address and a new
 * password, with her own session, and signs in with them on the preview
 * client. The screens then read as the preview account, with a fresh cache in
 * memory. Leaving signs that session out on this device, drops its cache, and
 * returns to her own language; the screens read as her again. Her own session
 * is never touched.
 *
 * The preview language is set on this device only. A right-to-left language
 * restarts the app, as it does for a player, and the preview comes back.
 */
import { shouldRestartForLanguage } from '@/components/auth/language-restart-policy';
import type { QueryClient } from '@tanstack/react-query';
import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';
import { startPlayerPreview as requestPreviewCredentials } from '@ramassa/shared/auth';
import { AppError, type Result } from '@ramassa/shared/errors';
import { isSupportedLanguage, type SupportedLanguage } from '@ramassa/shared/i18n';
import { i18n } from './i18n';
import { safeAsync } from './observability';
import { markPreviewHandover } from './preview-handover';
import { createPreviewQueryClient } from './query-client';
import { ownSupabase, previewMode, previewSupabase } from './supabase';

let previewQueryClient = createPreviewQueryClient();

export function currentPreviewQueryClient(): QueryClient {
  return previewQueryClient;
}

async function showLanguage(language: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  if (process.env.EXPO_OS !== 'web' && shouldRestartForLanguage(I18nManager.isRTL, language)) {
    await reloadAppAsync();
  }
}

export function startPreview(target: string | null): Promise<Result<void, AppError>> {
  return safeAsync(async () => {
    // A second start in the same moment replaces the password before this one
    // signs in (ADR-027), so a refused sign-in starts once more.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const credentials = await requestPreviewCredentials(ownSupabase);
      const { error } = await previewSupabase.auth.signInWithPassword(credentials);
      if (error === null) {
        previewQueryClient = createPreviewQueryClient();
        markPreviewHandover();
        previewMode.start(target, i18n.resolvedLanguage ?? i18n.language);
        return;
      }
      if (attempt === 1) throw new AppError('AUTH-1', { message: error.message });
    }
  });
}

export function choosePreviewLanguage(language: SupportedLanguage): Promise<void> {
  return showLanguage(language);
}

export async function leavePreview(): Promise<void> {
  const returnLanguage = previewMode.returnLanguage();
  markPreviewHandover();
  previewMode.end();
  previewQueryClient.clear();
  await previewSupabase.auth.signOut({ scope: 'local' });
  if (returnLanguage !== null && isSupportedLanguage(returnLanguage)) {
    await showLanguage(returnLanguage);
  }
}
