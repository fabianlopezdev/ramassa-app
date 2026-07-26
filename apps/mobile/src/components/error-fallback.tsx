/**
 * The translated, accessible fallback screen every route-zone ErrorBoundary
 * renders (RAPP-12). Shows the friendly translated message PLUS the short
 * stable code (e.g. `AUTH-3`) so staff can report exactly what happened over
 * the phone; announces itself to screen readers and offers a retry.
 */

import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { logger } from '@/lib/observability';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Text, View } from 'react-native';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';

export interface ErrorFallbackProps {
  error: unknown;
  retry: () => void;
}

export function ErrorFallback({ error, retry }: ErrorFallbackProps) {
  const { t } = useTranslation('errors');
  const languageFontClass = useLanguageFontClass();
  const appError = toAppError(error);
  const friendlyMessage = t(getErrorMessageKey(appError.code));
  const codeLine = `${t('errorCodeLabel')}: ${appError.code}`;

  useEffect(() => {
    // The boundary caught a render-time crash the safeAsync path never saw;
    // this is its single report to the log + Sentry.
    logger.error('error boundary rendered', { error: appError, code: appError.code });
    AccessibilityInfo.announceForAccessibility(`${t('fallbackTitle')}. ${friendlyMessage}`);
    // Depends only on the code: announce + report once per caught error, not
    // on every re-render of the fallback.
  }, [appError.code]);

  return (
    <View className="flex-1 items-center justify-center gap-md bg-white p-lg">
      <Text
        accessibilityRole="header"
        className={`text-center text-2xl font-bold text-neutral-900 ${languageFontClass}`}
      >
        {t('fallbackTitle')}
      </Text>
      <Text className={`text-center text-lg text-neutral-700 ${languageFontClass}`}>
        {friendlyMessage}
      </Text>
      {/* Selectable: staff read this code out to report a fault, and copying it
          beats transcribing it. */}
      <Text selectable className={`text-center text-sm text-neutral-500 ${languageFontClass}`}>
        {codeLine}
      </Text>
      <PressableScale
        accessibilityLabel={t('retry')}
        onPress={retry}
        haptic="tapLight"
        style={continuousCorners}
        className="min-h-recommended items-center justify-center rounded-md bg-primary px-xl py-sm"
      >
        <Text className={`text-lg font-bold text-white ${languageFontClass}`}>{t('retry')}</Text>
      </PressableScale>
    </View>
  );
}
