import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

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

      {/* A native Modal has its own Android root, outside the app-level gesture
          root. Use the platform pressable here so both actions remain tappable
          without nesting a second GestureHandlerRootView, which crashes Fabric. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('push:rationaleAccept')}
        onPress={() => {
          playHaptic('tapLight');
          onAccept();
        }}
        style={continuousCorners}
        className="mt-sm min-h-recommended items-center justify-center rounded-md bg-primary px-lg active:opacity-90"
      >
        <Text className={`text-base font-semibold text-white ${languageFontClass}`}>
          {t('push:rationaleAccept')}
        </Text>
      </Pressable>

      {/* Equal tap target, quieter styling: a real choice, not a dead end. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('push:rationaleDecline')}
        onPress={() => {
          playHaptic('selection');
          onDecline();
        }}
        className="min-h-recommended items-center justify-center rounded-md px-lg active:opacity-70"
      >
        <Text className={`text-base font-medium text-neutral-600 ${languageFontClass}`}>
          {t('push:rationaleDecline')}
        </Text>
      </Pressable>
    </View>
  );
}
