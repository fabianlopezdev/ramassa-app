/**
 * The form-level error banner for the auth screens (RAPP-13): the friendly
 * translated message for an `AUTH-*` code PLUS the short stable code, so a
 * player (or the staff member helping them) can report exactly what happened.
 * Announced assertively to screen readers because it reports a failed action.
 */

import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { getErrorMessageKey, type AppErrorCode } from '@ramassa/shared/errors';

export function AuthFormError({ code }: { code: AppErrorCode | null }) {
  const { t } = useTranslation('errors');
  const languageFontClass = useLanguageFontClass();

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
      <Text className={`text-start text-md font-medium text-error ${languageFontClass}`}>
        {t(getErrorMessageKey(code))}
      </Text>
      {/* Selectable for the same reason as the fallback screen: this code is what
          gets reported, so it should be copiable rather than transcribed. */}
      <Text selectable className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
        {t('errorCodeLabel')}: {code}
      </Text>
    </View>
  );
}
