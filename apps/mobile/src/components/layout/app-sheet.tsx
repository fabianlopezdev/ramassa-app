/**
 * The one sheet frame of the app (RAPP-812): a native page sheet with its
 * title, the content scrolling under it and a close action at the end.
 *
 * Two rules live here so no sheet repeats them:
 * - A native Modal sits above the app lock's cover, so the sheet hides while
 *   the app is locked (RAPP-236).
 * - A native Modal owns a separate Android root outside the app's gesture
 *   root. The content sits in `NativeModalScope`, where `PressableScale` and
 *   `PressableDepth` render the platform `Pressable`, so content uses the
 *   shared press controls like any screen and they answer on Android.
 *
 * The close action is the raised button every screen uses (RAPP-878).
 */
import { useAppLock } from '@/components/auth/app-lock';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { NativeModalScope } from '@/components/motion/native-modal-scope';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface AppSheetProps {
  /** On the sheet's scrolling content; the close action is `${testID}-close` unless `closeTestID` says otherwise. */
  readonly testID: string;
  readonly closeTestID?: string;
  readonly title: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function AppSheet({
  testID,
  closeTestID = `${testID}-close`,
  title,
  visible,
  onClose,
  children,
}: AppSheetProps) {
  const { t } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { isCovered } = useAppLock();

  return (
    <Modal
      visible={visible && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <NativeModalScope>
        <SafeAreaView className="flex-1 bg-white">
          <ScrollView
            testID={testID}
            contentContainerClassName="gap-lg p-lg"
            contentInsetAdjustmentBehavior="automatic"
          >
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
            >
              {title}
            </Text>
            {children}
            <RaisedActionButton testID={closeTestID} label={t('close')} onPress={onClose} />
          </ScrollView>
        </SafeAreaView>
      </NativeModalScope>
    </Modal>
  );
}
