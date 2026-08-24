/**
 * The shell every wizard step renders inside (RAPP-21): in-screen header with
 * back and a visual progress bar, keyboard-safe scrolling body, and the
 * primary action pinned after the content.
 *
 * The header is in-screen, not the native stack header, for the same reasons
 * the dev menu's is (RAPP-93/94): the native header vanishes under RTL on
 * Android and its custom subviews have upstream RTL defects, and this flow is
 * the first thing an Arabic-speaking player ever sees.
 *
 * Progress is a BAR plus a "step X of Y" line, not just text: the SPEC's
 * low-literacy rule is visual progress, and five segments filling up needs no
 * reading at all.
 */

import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, Text, View, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const WIZARD_TOTAL_STEPS = 5;

/**
 * Fixed-width digits for the "step X of Y" counter, so the line does not
 * re-flow by a pixel as the wizard advances. Hoisted, never an object literal
 * in JSX (contract rule 17's perf clause): one shared object for every step.
 */
const tabularNumerals: TextStyle = { fontVariant: ['tabular-nums'] };

export interface WizardFrameProps {
  /**
   * Omit outside the wizard. The profile edit screen reuses this frame for its
   * header, keyboard handling and pinned action, but it is not step N of
   * anything: showing a progress bar there would promise a sequence that does
   * not exist.
   */
  readonly stepNumber?: number;
  readonly title: string;
  readonly intro?: string;
  readonly children: ReactNode;
  readonly continueLabel: string;
  readonly onContinue: () => void;
  readonly isContinueBusy?: boolean;
  /** Omit on the first step: there is nowhere to go back to. */
  readonly onBack?: () => void;
}

/**
 * The keyboard-aware wrapper, iOS only. On Android the platform resizes the
 * window when the keyboard opens, so a KeyboardAvoidingView with no `behavior`
 * is a pure no-op layer.
 */
function Frame({ children }: { readonly children: ReactNode }) {
  // `EXPO_OS`, not `Platform.OS`: it is inlined at bundle time, so the branch
  // folds away per platform instead of being decided on every render.
  if (process.env.EXPO_OS !== 'ios') {
    return <View className="flex-1">{children}</View>;
  }
  return (
    <KeyboardAvoidingView className="flex-1" behavior="padding">
      {children}
    </KeyboardAvoidingView>
  );
}

export function WizardFrame({
  stepNumber,
  title,
  intro,
  children,
  continueLabel,
  onContinue,
  isContinueBusy,
  onBack,
}: WizardFrameProps) {
  const { t } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      {/* iOS only. On Android a KeyboardAvoidingView with no `behavior` does
          nothing except add a layer (the platform resizes the window for the
          keyboard already), and that extra layer showed up as a stack of
          full-screen scroll containers over the real one. */}
      <Frame>
        <View className="gap-sm px-lg pt-sm">
          <View className="min-h-min flex-row items-center justify-between">
            {onBack === undefined ? (
              <View />
            ) : (
              <PressableScale
                accessibilityLabel={t('backAction')}
                onPress={onBack}
                haptic="selection"
                className="min-h-min justify-center py-sm"
              >
                <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
                  {t('backAction')}
                </Text>
              </PressableScale>
            )}
            {/* The testID is the one thing on a wizard screen that is both
                always on screen (this header does not scroll) and identical in
                every language, which is what the capture and QA suites anchor
                on: the step TITLE scrolls away, so waiting on it reports "not
                there yet" for a step that arrived fine. */}
            {stepNumber === undefined ? (
              <View />
            ) : (
              <Text
                testID={`wizard-step-${stepNumber}`}
                style={tabularNumerals}
                className={`text-sm text-neutral-500 ${languageFontClass}`}
              >
                {t('stepOf', { current: stepNumber, total: WIZARD_TOTAL_STEPS })}
              </Text>
            )}
          </View>

          {/* Five segments filling left to right (mirrored under RTL by the
              flex row itself), so progress reads without reading.

              Hidden from BOTH accessibility trees, not just iOS's:
              `accessibilityElementsHidden` is iOS-only, so on Android (where
              most of this audience is) a screen reader still stopped on five
              unlabelled boxes between the header and the title. The same
              progress is already spoken by the "step X of Y" line above. */}
          {stepNumber === undefined ? null : (
            <View
              className="flex-row gap-xs"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {Array.from({ length: WIZARD_TOTAL_STEPS }, (_unused, index) => (
                <View
                  key={index}
                  className={`h-xs flex-1 rounded-full ${
                    index < stepNumber ? 'bg-primary' : 'bg-neutral-200'
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        {/* `flex-1` is load-bearing, not decoration: without it the ScrollView
            sizes itself to its CONTENT on Android, so its scroll range is zero
            and everything past the first screenful is simply unreachable. It
            hid in Catalan (which fits) and appeared in Arabic, whose longer
            wrapping pushed the nationality picker, the language chips and the
            Continue button off the bottom with no way to scroll to them. */}
        <ScrollView
          className="flex-1"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="grow gap-lg p-lg"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {title}
            </Text>
            {intro === undefined ? null : (
              <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                {intro}
              </Text>
            )}
          </View>

          {children}

          <AuthSubmitButton label={continueLabel} onPress={onContinue} isLoading={isContinueBusy} />
        </ScrollView>
      </Frame>
    </SafeAreaView>
  );
}
