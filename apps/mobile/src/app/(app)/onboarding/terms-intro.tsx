/**
 * The terms introduction's old address (RAPP-613), kept for one release
 * (RAPP-772): a draft saved there, or a link to it, opens the terms form's
 * first screen. Terms this build cannot read open their retry screen.
 */
import { wizardStepRoute } from '@/lib/onboarding-intake';
import { useWizardIntake } from '@/lib/onboarding-intake-context';
import { Redirect } from 'expo-router';
import { currentTermsStep, DEFAULT_WIZARD_FLOW, termsStepKey } from '@ramassa/shared/intake';

export default function TermsIntroductionRedirect() {
  const { flow = DEFAULT_WIZARD_FLOW } = useWizardIntake();
  const step = currentTermsStep('terms-intro', flow);
  return (
    <Redirect href={wizardStepRoute(step === 'terms-intro' ? termsStepKey('unavailable') : step)} />
  );
}
