/**
 * The step-up check before a risky action on the phone (RAPP-286, ADR-026).
 *
 * Two checks, in this order. First the device: biometrics or the phone's
 * passcode, so a phone left unlocked on a desk cannot erase a record. Second
 * the authenticator code, because the database refuses these actions without
 * a code from the last 10 minutes (`private.require_recent_second_factor()`).
 * The code is asked only when the session has none that recent. If the
 * database still refuses (AUTH-9), the code is asked once more and the action
 * runs again, as on the web admin.
 *
 * The web build has no device check, so there only the code is asked.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthFormError } from '@/components/auth/auth-form-error';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { supabase } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirmSecondFactor, hasRecentSecondFactor } from '@ramassa/shared/auth';
import { AppError, isAppError, toAppError, type AppErrorCode } from '@ramassa/shared/errors';

type WithStepUp = <T>(run: () => Promise<T>) => Promise<T>;

const StepUpContext = createContext<WithStepUp | null>(null);

const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';
const NON_DIGITS = /\D/g;

export function useStepUp(): WithStepUp {
  const withStepUp = useContext(StepUpContext);
  if (withStepUp === null) {
    throw new AppError('UNEXPECTED-1', { message: 'useStepUp needs a StepUpProvider' });
  }
  return withStepUp;
}

interface PendingRequest {
  readonly resolve: () => void;
  readonly reject: (error: AppError) => void;
}

function cancelled(): AppError {
  return new AppError('AUTH-9', { message: 'Step-up cancelled' });
}

export function StepUpProvider({ children }: { readonly children: ReactNode }) {
  const { isAvailable, confirmOwner } = useAppLock();
  const [isAsking, setIsAsking] = useState(false);
  const pending = useRef<PendingRequest | null>(null);

  const askForCode = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setIsAsking(true);
      }),
    [],
  );

  const finish = useCallback((verified: boolean) => {
    const request = pending.current;
    pending.current = null;
    setIsAsking(false);
    if (verified) request?.resolve();
    else request?.reject(cancelled());
  }, []);

  const withStepUp = useCallback<WithStepUp>(
    async (run) => {
      // A phone with no passcode has no device check to offer; the code still holds.
      if (IS_NATIVE && isAvailable && !(await confirmOwner())) throw cancelled();
      const { data } = await supabase.auth.getSession();
      if (!hasRecentSecondFactor(data.session)) await askForCode();
      try {
        return await run();
      } catch (thrown) {
        if (!isAppError(thrown) || thrown.code !== 'AUTH-9') throw thrown;
        await askForCode();
        return run();
      }
    },
    [askForCode, confirmOwner, isAvailable],
  );

  const value = useMemo(() => withStepUp, [withStepUp]);

  return (
    <StepUpContext.Provider value={value}>
      {children}
      <StepUpSheet visible={isAsking} onFinish={finish} />
    </StepUpContext.Provider>
  );
}

function StepUpSheet({
  visible,
  onFinish,
}: {
  readonly visible: boolean;
  readonly onFinish: (verified: boolean) => void;
}) {
  const { t } = useTranslation('auth');
  const fontClass = useLanguageFontClass();
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  const [code, setCode] = useState('');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const close = (verified: boolean) => {
    setCode('');
    setErrorCode(null);
    onFinish(verified);
  };
  const submit = async () => {
    setErrorCode(null);
    setIsVerifying(true);
    try {
      await confirmSecondFactor(supabase, code);
      close(true);
    } catch (error) {
      setErrorCode(toAppError(error).code);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Modal
      visible={visible && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!isVerifying) close(false);
      }}
    >
      <SafeAreaView className="flex-1 bg-white" testID="step-up">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerClassName="gap-md p-lg"
            keyboardShouldPersistTaps="handled"
            // The page sheet does not move with the keyboard, so the scroll view does.
            automaticallyAdjustKeyboardInsets
          >
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('stepUpTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
              {t('stepUpIntro')}
            </Text>
            <AuthFormError code={errorCode} />
            <AuthTextField
              testID="step-up-code"
              label={t('secondFactorCodeLabel')}
              value={code}
              onChangeText={(next) => setCode(next.replace(NON_DIGITS, '').slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
            />
            <View className="flex-row flex-wrap gap-sm">
              <PressableScale
                testID="step-up-confirm"
                accessibilityRole="button"
                accessibilityLabel={t('secondFactorVerifyAction')}
                onPress={() => {
                  if (code.length === 6) void submit();
                }}
                isBusy={isVerifying}
                isDisabled={code.length !== 6}
                haptic="tapLight"
                style={continuousCorners}
                className={`min-h-recommended items-center justify-center rounded-md px-lg ${
                  code.length === 6 ? 'bg-primary' : 'bg-neutral-300'
                }`}
              >
                <Text
                  className={`text-center text-md font-bold ${
                    code.length === 6 ? 'text-white' : 'text-neutral-700'
                  } ${fontClass}`}
                >
                  {t('secondFactorVerifyAction')}
                </Text>
              </PressableScale>
              <PressableScale
                testID="step-up-cancel"
                accessibilityRole="button"
                accessibilityLabel={t('stepUpCancel')}
                onPress={() => close(false)}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
              >
                <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
                  {t('stepUpCancel')}
                </Text>
              </PressableScale>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
