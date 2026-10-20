/** Accessible, translated auth feedback. Technical details stay in error reporting. */

import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Text, View } from 'react-native';
import { getErrorMessageKey, type AppErrorCode } from '@ramassa/shared/errors';

// Queued so VoiceOver finishes reading the pressed button before the error.
const queuedAnnouncement = { queue: true } as const;

export function AuthFormError({ code }: { code: AppErrorCode | null }) {
  const { t } = useTranslation('errors');
  const languageFontClass = useLanguageFontClass();
  const message = code ? t(getErrorMessageKey(code)) : null;

  useEffect(() => {
    // `accessibilityLiveRegion` is Android-only, so VoiceOver needs an
    // explicit announcement to learn that the action failed.
    if (message && process.env.EXPO_OS === 'ios') {
      AccessibilityInfo.announceForAccessibilityWithOptions(message, queuedAnnouncement);
    }
  }, [message]);

  if (!code) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={continuousCorners}
      className="gap-xs rounded-md bg-error/10 p-md"
    >
      <Text className={`text-start text-form font-medium text-error ${languageFontClass}`}>
        {message}
      </Text>
    </View>
  );
}
