/**
 * The terms' old address (RAPP-21), kept for one release (RAPP-772): a draft
 * saved there, or a link to it, opens the terms form's last screen, the one
 * she signs. Terms this build cannot read open their retry screen.
 */
import { wizardStepRoute } from '@/lib/onboarding-intake';
import { useWizardIntake } from '@/lib/onboarding-intake-context';
import { Redirect } from 'expo-router';
import { currentTermsStep, DEFAULT_WIZARD_FLOW, termsStepKey } from '@ramassa/shared/intake';

export default function TermsRedirect() {
  const { flow = DEFAULT_WIZARD_FLOW } = useWizardIntake();
  const step = currentTermsStep('terms', flow);
  return <Redirect href={wizardStepRoute(step === 'terms' ? termsStepKey('unavailable') : step)} />;
}
