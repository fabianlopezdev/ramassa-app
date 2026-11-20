import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

/**
 * The explanation shown BEFORE the OS notification prompt (RAPP-17).
 *
 * SPEC UX hard constraint: never a bare system dialog first. The audience is
 * newly-arrived women who may have little experience with app permissions and
 * are reading in their second or third language; a system prompt with no context
 * reads as a demand and gets declined, and iOS only ever asks ONCE, so a reflexive
 * "no" is permanent short of a trip into Settings. Saying plainly what we will
 * send, and that it is only that, is what earns the yes.
 *
 * "Not now" is a real, equal-weight choice: push is optional and the app is fully
 * usable without it, so declining must not look like the wrong answer.
 */
export function PushPermissionRationale({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation('push');
  const languageFontClass = useLanguageFontClass();

  return (
    <View
      className="gap-md rounded-lg bg-white p-lg"
      style={continuousCorners}
      accessibilityRole="alert"
    >
      <Text
        accessibilityRole="header"
        className={`text-xl font-bold text-neutral-900 ${languageFontClass}`}
      >
        {t('push:rationaleTitle')}
      </Text>
      <Text className={`text-base text-neutral-700 ${languageFontClass}`}>
        {t('push:rationaleBody')}
      </Text>

      {/* Both are real, full-size choices: the call to action, and a raised
          "not now" under it. The Modal that shows this opens
          `NativeModalScope`, so both answer on Android. */}
      <View className="mt-sm gap-sm">
        <AuthSubmitButton
          testID="push-rationale-accept"
          label={t('push:rationaleAccept')}
          onPress={onAccept}
        />
        <RaisedActionButton
          testID="push-rationale-decline"
          label={t('push:rationaleDecline')}
          onPress={onDecline}
        />
      </View>
    </View>
  );
}
