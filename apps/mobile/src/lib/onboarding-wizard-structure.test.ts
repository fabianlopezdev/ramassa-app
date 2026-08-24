import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

const onboardingDir = join(import.meta.dir, '../app/(app)/onboarding');
const welcomeSource = readFileSync(join(onboardingDir, 'index.tsx'), 'utf8');
const backgroundPath = join(onboardingDir, 'background.tsx');
const backgroundSource = existsSync(backgroundPath) ? readFileSync(backgroundPath, 'utf8') : '';
const documentationSource = readFileSync(join(onboardingDir, 'documentation.tsx'), 'utf8');
const logisticsSource = readFileSync(join(onboardingDir, 'logistics.tsx'), 'utf8');
const termsSource = readFileSync(join(onboardingDir, 'terms.tsx'), 'utf8');
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
    expect(welcomeSource).toContain("currentStep: 'background'");
    expect(welcomeSource).toContain("router.push('/onboarding/background')");
  });

  test('the new background step owns the remaining identity questions', () => {
    expect(backgroundSource).toContain('identityFormSchema');
    expect(backgroundSource).toContain('name="day"');
    expect(backgroundSource).toContain('name="month"');
    expect(backgroundSource).toContain('name="year"');
    expect(backgroundSource).toContain('name="placeOfBirth"');
    expect(backgroundSource).toContain('name="nationality"');
    expect(backgroundSource).toContain('name="preferredLanguage"');
  });

  test('progress and back navigation include the new step', () => {
    expect(frameSource).toContain('WIZARD_TOTAL_STEPS = 5');
    expect(backgroundSource).toContain('stepNumber={2}');
    expect(documentationSource).toContain('stepNumber={3}');
    expect(documentationSource).toContain("persist('background')");
    expect(documentationSource).toContain("router.replace('/onboarding/background')");
    expect(logisticsSource).toContain('stepNumber={4}');
    expect(termsSource).toContain('stepNumber={5}');
  });
});
