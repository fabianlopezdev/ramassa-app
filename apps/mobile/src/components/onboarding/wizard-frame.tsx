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
 *
 * Inside the wizard, staff wording of a built-in screen (RAPP-612) replaces
 * the title, intro and button the screen passes, in her language only, and a
 * help line staff wrote shows first in the body. Validation messages are the
 * screens' own and never change.
 *
 * The Fitxa fields placed on a built-in screen (RAPP-655) follow the screen's
 * own questions. Continue checks and saves them before the screen's own
 * Continue runs; Back saves them.
 */

import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTitle } from '@/components/auth/auth-title';
import { FormScreen } from '@/components/layout/form-screen';
import { usePlacedFields } from '@/components/onboarding/placed-fields';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { WizardProgress } from '@/components/onboarding/wizard-progress';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { useOnboardingEntrance } from '@/lib/onboarding-entrance';
import { useScreenWording } from '@/lib/screen-wording';
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { WIZARD_QUESTION_SCREENS, type WizardStepKey } from '@ramassa/shared/intake';

/** Question screens followed by review, introduction and app terms. */
const WIZARD_TOTAL_STEPS = WIZARD_QUESTION_SCREENS.length + 3;

export interface WizardFrameProps {
  /** Stable identity, independent of language and position in a personalized wizard. */
  readonly screenId?:
    WizardStepKey | 'documentation-details' | 'applicant-status-details' | `needs-detail:${string}`;
  /**
   * Omit outside the wizard. The profile edit screen reuses this frame for its
   * header, keyboard handling and pinned action, but it is not step N of
   * anything: showing a progress bar there would promise a sequence that does
   * not exist.
   */
  readonly stepNumber?: number;
  readonly scrollEnabled?: boolean;
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
  scrollEnabled,
  totalSteps = WIZARD_TOTAL_STEPS,
  title,
  intro,
  children,
  continueLabel,
  onContinue,
  isContinueBusy,
  onBack,
}: WizardFrameProps) {
  const { entrance, edit } = useLocalSearchParams<{ entrance?: string; edit?: string }>();
  const showProgress = stepNumber !== undefined && edit !== '1';
  const entranceMode = useOnboardingEntrance(screenId, entrance !== 'none' && edit !== '1');
  const wording = useScreenWording(screenId);
  const { t } = useTranslation('onboarding');
  const added = usePlacedFields(screenId);

  return (
    <FormScreen
      entrance={entranceMode}
      scrollEnabled={added.isDrawing ? false : scrollEnabled}
      navigation={
        <WizardProgress
          step={showProgress ? stepNumber : undefined}
          total={totalSteps}
          onBack={
            onBack === undefined || !added.hasQuestions
              ? onBack
              : () => {
                  added.save();
                  onBack();
                }
          }
        />
      }
      heading={
        <AuthTitle
          title={wording.text('title', title)}
          subtitle={wording.text('intro', intro)}
          align="start"
        />
      }
      bottomAction={
        <AuthSubmitButton
          label={wording.text('continue_label', continueLabel)}
          onPress={
            added.hasQuestions
              ? () => {
                  if (added.checkAndSave()) onContinue();
                }
              : onContinue
          }
          isLoading={isContinueBusy}
        />
      }
    >
      <View className="gap-lg">
        <QuestionHelp text={wording.help} />
        {children}
        <WizardValidationSummary
          testID="wizard-added-errors"
          isVisible={added.hasErrors}
          message={t('errorSummary')}
        />
        {added.fields}
      </View>
    </FormScreen>
  );
}
