/**
 * The short, stable code that sits under a failure message (contract rule 7:
 * user-facing errors are translated AND show a short code).
 *
 * The auth screens have carried this since RAPP-13, inside `AuthFormError`'s
 * tinted panel. The profile and wizard failures want the code without the
 * panel: their messages are placed and announced deliberately (directly above
 * the button that just failed, politely rather than assertively), and wrapping
 * them in a second treatment would undo that. So the CODE is the shared part,
 * not the whole banner.
 *
 * Selectable for the same reason as the fallback screen: this is the thing a
 * participant reads out or a staff member forwards, so it should be copiable
 * rather than transcribed from a photo of a phone.
 */

import { ShakeOnError } from '@/components/motion/shake-on-error';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { AppErrorCode } from '@ramassa/shared/errors';

export function ErrorCodeLine({ code }: { readonly code: AppErrorCode }) {
  const { t } = useTranslation('errors');
  const languageFontClass = useLanguageFontClass();

  return (
    <Text selectable className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
      {t('errorCodeLabel')}: {code}
    </Text>
  );
}

/**
 * The whole surface an action that FAILED puts under itself: the shake, the
 * translated message, and the code, in that arrangement.
 *
 * Assembled here rather than repeated per screen because the three parts are a
 * contract, not a layout. The shake is emphasis and says nothing on its own; the
 * message is the signal and has to be announced politely so it does not cut
 * across whatever the player is reading; the code is the only thing staff can
 * act on when the message is not enough. A screen that reproduced this by hand
 * and dropped `accessibilityLiveRegion` would look identical and go silent for
 * the players who most need it.
 *
 * The CALLER decides whether it is on screen (`code === null ? null : ...`),
 * deliberately: mounting is the parent's business, and a fresh mount per failure
 * is what makes a second failed attempt shake again rather than sit still.
 *
 * Not for the failure surfaces that carry more than this. The profile tab's
 * failed read adds a retry button and speaks at body size, because there the
 * failure IS the screen rather than a note under a button.
 */
export function FailureNotice({
  code,
  message,
}: {
  readonly code: AppErrorCode;
  readonly message: string;
}) {
  const languageFontClass = useLanguageFontClass();

  return (
    <ShakeOnError errorCode={code}>
      <View className="gap-xs">
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {message}
        </Text>
        <ErrorCodeLine code={code} />
      </View>
    </ShakeOnError>
  );
}
