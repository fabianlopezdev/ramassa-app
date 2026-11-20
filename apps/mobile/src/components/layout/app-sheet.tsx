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
 * The sheet's action sits at its bottom edge, under the scrolling content
 * (RAPP-881): "Tanca" as the app's call to action, or the sheet's own main
 * action in its place, such as "Envia l'avís". The keyboard pushes it up.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { NativeModalScope } from '@/components/motion/native-modal-scope';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

const fillStyle = { flex: 1 } as const;
const KEYBOARD_BEHAVIOR = process.env.EXPO_OS === 'ios' ? 'padding' : undefined;

export interface AppSheetProps {
  /** On the sheet's scrolling content; the close action is `${testID}-close` unless `closeTestID` says otherwise. */
  readonly testID: string;
  readonly closeTestID?: string;
  readonly title: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /**
   * The sheet's own main action, at the bottom in place of "Tanca"; she
   * dismisses such a sheet by dragging it down.
   */
  readonly action?: ReactNode;
}

export function AppSheet({
  testID,
  closeTestID = `${testID}-close`,
  title,
  visible,
  onClose,
  children,
  action,
}: AppSheetProps) {
  const { t } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { isCovered } = useAppLock();
  // A page sheet starts under the status bar, so the keyboard covers that much
  // more of it than the sheet's own frame tells `KeyboardAvoidingView`.
  const { top: sheetTopOffset } = useSafeAreaInsets();

  // The bottom action takes room above the keyboard, so a field she taps can
  // end up behind it: once the keyboard is up, the field scrolls clear of it.
  const scrollRef = useRef<ScrollView>(null);
  const actionRef = useRef<View>(null);
  const scrollOffset = useRef(0);
  const rememberScrollOffset = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
  }, []);
  useEffect(() => {
    const keyboardShown = Keyboard.addListener('keyboardDidShow', () => {
      const field = TextInput.State.currentlyFocusedInput();
      if (field === null) return;
      field.measureInWindow((_fieldX, fieldTop, _fieldWidth, fieldHeight) => {
        actionRef.current?.measureInWindow((_actionX, actionTop) => {
          const hidden = fieldTop + fieldHeight + tokens.spacing.md - actionTop;
          if (hidden > 0) {
            scrollRef.current?.scrollTo({ y: scrollOffset.current + hidden, animated: true });
          }
        });
      });
    });
    return () => keyboardShown.remove();
  }, []);

  return (
    <Modal
      visible={visible && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <NativeModalScope>
        <SafeAreaView className="flex-1 bg-white">
          <KeyboardAvoidingView
            style={fillStyle}
            behavior={KEYBOARD_BEHAVIOR}
            keyboardVerticalOffset={sheetTopOffset}
          >
            <ScrollView
              ref={scrollRef}
              testID={testID}
              style={fillStyle}
              onScroll={rememberScrollOffset}
              scrollEventThrottle={16}
              contentContainerClassName="gap-lg p-lg"
              contentInsetAdjustmentBehavior="automatic"
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            >
              <Text
                accessibilityRole="header"
                className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
              >
                {title}
              </Text>
              {children}
            </ScrollView>
            <View ref={actionRef} className="gap-sm border-t border-neutral-200 px-lg pb-md pt-md">
              {action ?? (
                <AuthSubmitButton testID={closeTestID} label={t('close')} onPress={onClose} />
              )}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </NativeModalScope>
    </Modal>
  );
}
