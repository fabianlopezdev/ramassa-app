/**
 * "Ara no" on the terms she signs (RAPP-21, RAPP-613): it asks first, then
 * signs her out; the gate brings her back to the terms on her next sign-in.
 * Her Onboarding saves where she was before (`onLeave`). The label is the
 * screen's own (RAPP-772) or the app's.
 */

import { PressableScale } from '@/components/motion/pressable-scale';
import { logout } from '@/lib/auth';
import { confirmAction } from '@/lib/confirm-action';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

export function TermsDeclineAction({
  label,
  isDisabled,
  onLeave,
}: {
  /** The screen's own label; null shows the app's. */
  readonly label: string | null;
  readonly isDisabled: boolean;
  /** Runs once she confirms, before she is signed out. */
  readonly onLeave?: () => void;
}) {
  const { t } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const shown = label ?? t('termsDeclineAction');
  return (
    <PressableScale
      accessibilityLabel={shown}
      isDisabled={isDisabled}
      onPress={() =>
        confirmAction({
          title: t('termsLeaveTitle'),
          message: t('termsLeaveBody'),
          cancelLabel: t('termsLeaveStayAction'),
          confirmLabel: t('termsLeaveConfirmAction'),
          onConfirm: () => {
            onLeave?.();
            void logout();
          },
        })
      }
      haptic="selection"
      className="min-h-min items-center justify-center py-sm"
    >
      <Text className={`text-form font-medium text-neutral-700 ${languageFontClass}`}>{shown}</Text>
    </PressableScale>
  );
}
