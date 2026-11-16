/**
 * The frame of the partner entity's sheets (RAPP-803, RAPP-805): a page sheet
 * with its title, the content and a close action at the end. A native Modal
 * sits above the app lock's cover, so it hides while the app is locked.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function EntitySheet({
  testID,
  title,
  visible,
  onClose,
  children,
}: {
  readonly testID: string;
  readonly title: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
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
      <SafeAreaView className="flex-1 bg-white" testID={testID}>
        <ScrollView contentContainerClassName="gap-lg p-lg">
          <Text
            accessibilityRole="header"
            className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
          >
            {title}
          </Text>
          {children}
          <PressableScale
            testID={`${testID}-close`}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
            onPress={onClose}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
          >
            <Text className={`text-center text-md font-semibold text-neutral-900 ${fontClass}`}>
              {t('close')}
            </Text>
          </PressableScale>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
