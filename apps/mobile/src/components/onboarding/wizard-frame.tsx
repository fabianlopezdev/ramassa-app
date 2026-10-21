/**
 * The shell every wizard step renders inside (RAPP-21): in-screen header with
 * back and a visual progress bar, keyboard-safe scrolling body, and the
 * primary action pinned at the bottom through the shared login form layout.
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

import { AuthBackButton } from '@/components/auth/auth-back-button';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTitle } from '@/components/auth/auth-title';
import { FormScreen } from '@/components/layout/form-screen';
import { useOnboardingEntrance } from '@/lib/onboarding-entrance';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type TextStyle } from 'react-native';
import { WIZARD_QUESTION_SCREENS, type WizardStepKey } from '@ramassa/shared/intake';

/** The full wizard: four question screens, the summary and the terms (RAPP-300). */
const WIZARD_TOTAL_STEPS = WIZARD_QUESTION_SCREENS.length + 2;

/**
 * Fixed-width digits for the "step X of Y" counter, so the line does not
 * re-flow by a pixel as the wizard advances. Hoisted, never an object literal
 * in JSX (contract rule 17's perf clause): one shared object for every step.
 */
const tabularNumerals: TextStyle = { fontVariant: ['tabular-nums'] };

export interface WizardFrameProps {
  /** Stable identity, independent of language and position in a personalized wizard. */
  readonly screenId?: WizardStepKey | 'documentation-details' | 'applicant-status-details';
  /**
   * Omit outside the wizard. The profile edit screen reuses this frame for its
   * header, keyboard handling and pinned action, but it is not step N of
   * anything: showing a progress bar there would promise a sequence that does
   * not exist.
   */
  readonly stepNumber?: number;
  /**
   * How many screens she will see. Fewer than the full wizard when staff or an
   * entity already answered whole screens (RAPP-300).
   */
  readonly totalSteps?: number;
  readonly title: string;
  readonly intro?: string;
  readonly children: ReactNode;
  readonly continueLabel: string;
  readonly onContinue: () => void;
  readonly isContinueBusy?: boolean;
  /** Omit on the first step: there is nowhere to go back to. */
  readonly onBack?: () => void;
}

export function WizardFrame(props: WizardFrameProps) {
  return <WizardFrameContent key={props.screenId} {...props} />;
}

function WizardFrameContent({
  screenId,
  stepNumber,
  totalSteps = WIZARD_TOTAL_STEPS,
  title,
  intro,
  children,
  continueLabel,
  onContinue,
  isContinueBusy,
  onBack,
}: WizardFrameProps) {
  const { t } = useTranslation('onboarding');
  const { entrance, edit } = useLocalSearchParams<{ entrance?: string; edit?: string }>();
  const languageFontClass = useLanguageFontClass();
  const entranceMode = useOnboardingEntrance(screenId, entrance !== 'none' && edit !== '1');

  return (
    <FormScreen
      entrance={entranceMode}
      navigation={
        <View className="gap-sm px-lg pt-sm">
          <View className="min-h-min flex-row items-center justify-between">
            {onBack === undefined ? <View /> : <AuthBackButton onPress={onBack} />}
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
                className={`text-form text-neutral-700 ${languageFontClass}`}
              >
                {t('stepOf', { current: stepNumber, total: totalSteps })}
              </Text>
            )}
          </View>

          {/* Progress segments filling left to right (mirrored under RTL by the
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
              {Array.from({ length: totalSteps }, (_unused, index) => (
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
      }
      heading={<AuthTitle title={title} subtitle={intro} align="start" />}
      bottomAction={
        <AuthSubmitButton label={continueLabel} onPress={onContinue} isLoading={isContinueBusy} />
      }
    >
      <View className="gap-lg">{children}</View>
    </FormScreen>
  );
}
