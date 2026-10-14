/**
 * The player preview opened from the web admin (RAPP-372, ADR-027). The admin
 * opens this page in a new tab; it tells its opener it is ready, and accepts
 * the credentials and the screen to open only from the admin's configured
 * origin and only from the window that opened it. It then signs in on the
 * preview client; the app mounts again as the preview account and opens the
 * screen. The tab closes when the preview ends.
 *
 * Reachable signed in or not, because this tab usually has no session of its
 * own. The web build only: the phone starts its preview itself.
 */
import { startHandedOverPreview } from '@/lib/player-preview';
import { usePreviewModeActive } from '@/lib/preview-mode';
import { mobileClientEnv, previewMode } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { originOf, PLAYER_PREVIEW_READY, playerPreviewHandoffSchema } from '@ramassa/shared/auth';
import { tokens } from '@ramassa/shared/tokens';

const adminUrl = mobileClientEnv.EXPO_PUBLIC_ADMIN_WEB_URL;

export default function PreviewHandoffScreen() {
  const { t } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const isPreview = usePreviewModeActive(previewMode);
  const [hasFailed, setHasFailed] = useState(adminUrl === undefined);

  useEffect(() => {
    if (process.env.EXPO_OS !== 'web' || adminUrl === undefined || isPreview) return undefined;
    const adminOrigin = originOf(adminUrl);
    const opener = window.opener as Window | null;
    if (opener === null) {
      setHasFailed(true);
      return undefined;
    }
    let isTaken = false;
    const receive = (event: MessageEvent) => {
      if (isTaken || event.origin !== adminOrigin || event.source !== opener) return;
      const handoff = playerPreviewHandoffSchema.safeParse(event.data);
      if (!handoff.success) return;
      isTaken = true;
      void startHandedOverPreview(handoff.data.credentials, handoff.data.target).then((result) => {
        if (!result.ok) setHasFailed(true);
      });
    };
    window.addEventListener('message', receive);
    opener.postMessage({ type: PLAYER_PREVIEW_READY }, adminOrigin);
    return () => window.removeEventListener('message', receive);
  }, [isPreview]);

  // The preview has started: the player area opens, then the item.
  if (isPreview || process.env.EXPO_OS !== 'web') return <Redirect href={'/' as Href} />;

  return (
    <View
      testID="preview-handoff"
      className="flex-1 items-center justify-center gap-md bg-white px-lg"
    >
      {hasFailed ? null : <ActivityIndicator color={tokens.colors.primary.DEFAULT} />}
      <Text
        accessibilityLiveRegion="polite"
        className={`text-center text-md text-neutral-700 ${fontClass}`}
      >
        {hasFailed ? t('previewStartFailed') : t('previewOpening')}
      </Text>
    </View>
  );
}
