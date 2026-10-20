import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

const onboardingDir = join(import.meta.dir, '../app/(app)/onboarding');
const welcomeSource = readFileSync(join(onboardingDir, 'index.tsx'), 'utf8');
const backgroundPath = join(onboardingDir, 'background.tsx');
const backgroundSource = existsSync(backgroundPath) ? readFileSync(backgroundPath, 'utf8') : '';
const documentationSource = readFileSync(join(onboardingDir, 'documentation.tsx'), 'utf8');
const logisticsSource = readFileSync(join(onboardingDir, 'logistics.tsx'), 'utf8');
const equipmentSource = readFileSync(join(onboardingDir, 'equipment.tsx'), 'utf8');
const termsSource = readFileSync(join(onboardingDir, 'terms.tsx'), 'utf8');
const summarySource = readFileSync(join(onboardingDir, 'summary.tsx'), 'utf8');
const frameSource = readFileSync(
  join(import.meta.dir, '../components/onboarding/wizard-frame.tsx'),
  'utf8',
);

describe('the onboarding welcome split', () => {
  test('step one asks only for the two name fields', () => {
    expect(welcomeSource).toContain('identityNameFormSchema');
    expect(welcomeSource.match(/<Controller/g)).toHaveLength(2);
    expect(welcomeSource).not.toContain('name="day"');
    expect(welcomeSource).not.toContain('name="nationality"');
    expect(welcomeSource).not.toContain('name="preferredLanguage"');
    // Where it goes next is the plan's call (RAPP-300): the background step,
    // unless staff already answered it.
    expect(welcomeSource).toContain("useWizardStep('identity')");
    expect(welcomeSource).toContain('currentStep: step.nextDraftStep');
    expect(welcomeSource).toContain('step.goNext()');
  });

  test('the new background step owns the remaining identity questions', () => {
    expect(backgroundSource).toContain('identityFormSchema');
    expect(backgroundSource).toContain('name="day"');
    expect(backgroundSource).toContain('name="month"');
    expect(backgroundSource).toContain('name="year"');
    expect(backgroundSource).toContain('name="placeOfBirth"');
    expect(backgroundSource).toContain('name="nationality"');
    expect(backgroundSource).not.toContain('name="preferredLanguage"');
  });

  test('progress and navigation come from the plan, counting only the screens she sees', () => {
    // Four question screens, the summary and the terms (RAPP-300).
    expect(frameSource).toContain('WIZARD_TOTAL_STEPS = WIZARD_QUESTION_SCREENS.length + 2');
    const screens = [
      ['background', backgroundSource],
      ['documentation', documentationSource],
      ['logistics', logisticsSource],
      ['equipment', equipmentSource],
      ['summary', summarySource],
      ['terms', termsSource],
    ] as const;
    for (const [screen, source] of screens) {
      expect(source).toContain(`useWizardStep('${screen}')`);
      expect(source).toContain('stepNumber={step.position.step}');
      expect(source).toContain('totalSteps={step.position.total}');
      expect(source).not.toMatch(/stepNumber=\{\d\}/);
    }
  });
});
