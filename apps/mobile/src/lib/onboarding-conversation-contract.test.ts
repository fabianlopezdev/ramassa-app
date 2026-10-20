import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

const root = join(import.meta.dir, '..');
const onboardingDir = join(root, 'app/(app)/onboarding');
const welcome = readFileSync(join(onboardingDir, 'index.tsx'), 'utf8');
const background = readFileSync(join(onboardingDir, 'background.tsx'), 'utf8');
const documentation = readFileSync(join(onboardingDir, 'documentation.tsx'), 'utf8');
const logistics = readFileSync(join(onboardingDir, 'logistics.tsx'), 'utf8');
const terms = readFileSync(join(onboardingDir, 'terms.tsx'), 'utf8');
const optionChip = readFileSync(join(root, 'components/onboarding/option-chip.tsx'), 'utf8');
const questionHeadingPath = join(root, 'components/onboarding/onboarding-question-heading.tsx');
const summaryPath = join(root, 'components/onboarding/wizard-validation-summary.tsx');

describe('conversational onboarding controls', () => {
  test('enumerable choice groups retain pictograms while nationality uses a plain label', () => {
    const questionHeading = Bun.file(questionHeadingPath);
    expect(questionHeading.size).toBeGreaterThan(0);
    const headingSource = readFileSync(questionHeadingPath, 'utf8');
    expect(headingSource).toContain('aria-hidden');
    expect(headingSource).toContain('accessibilityElementsHidden');
    expect(headingSource).toContain('importantForAccessibility="no-hide-descendants"');
    // Staff may reword a built-in question (RAPP-307): the app's label is the fallback.
    expect(background).toContain("label={wording.label('nationality', t('nationalityLabel'))}");
    expect(background).not.toContain('symbol=');
    expect(documentation).toContain('SelectionChoiceCard');
    expect(documentation).not.toContain('documentSymbol');
    expect(background).not.toContain("intro={t('backgroundIntro')}");
    const uses = [
      [logistics, "label={wording.label('city', t('cityLabel'))}", 'municipalitySymbol'],
      [
        logistics,
        "label={wording.label('reference_entity', t('referenceEntityLabel'))}",
        'entitySymbol',
      ],
      [
        logistics,
        "label={wording.label('dependents', t('hasDependentsLabel'))}",
        'dependentsSymbol',
      ],
      [
        logistics,
        "label={wording.label('clothing_size', t('clothingSizeLabel'))}",
        'clothingSymbol',
      ],
      [logistics, "label={wording.label('shoe_size', t('shoeSizeLabel'))}", 'shoeSymbol'],
    ] as const;
    for (const [source, label, symbol] of uses) {
      expect(source).toContain('<OnboardingQuestionHeading');
      expect(source).toContain(label);
      expect(source).toContain(`symbol={${symbol}}`);
    }
  });

  test('selected answers stay quieter than the solid primary action', () => {
    expect(optionChip).toContain('border-primary bg-primary/10');
    expect(optionChip).not.toContain('border-primary bg-primary px-lg');
    expect(optionChip).not.toContain('text-white');
  });

  test('an empty submit presents one shared summary on every form step', () => {
    expect(Bun.file(summaryPath).size).toBeGreaterThan(0);
    for (const source of [welcome, background, documentation, logistics]) {
      expect(source).toContain('<WizardValidationSummary');
      expect(source).toContain(
        source === documentation
          ? "message={t('documentChooseError')}"
          : "message={t('errorSummary')}",
      );
      expect(source).toContain('setHasSubmitErrors(true)');
    }
    expect(welcome).not.toContain("errors.firstName ? t('errorRequired')");
    expect(background).not.toContain("{t('errorRequired')}");
    expect(logistics).not.toContain("{t('errorRequired')}");
  });

  test('terms lead with plain-language points and reveal legal text in one tap', () => {
    expect(terms).toContain("t('termsPointPurposeTitle')");
    expect(terms).toContain("t('termsPointProtectedTitle')");
    expect(terms).toContain("t('termsPointPrivateTitle')");
    expect(terms).toContain("t('termsPointControlTitle')");
    expect(terms).toContain('isFullTermsVisible');
    expect(terms).toContain("'termsReadFullAction'");
    expect(terms).toContain("{t('termsBody')}");
  });
});

test('all onboarding locales carry the new conversational copy', () => {
  for (const locale of ['ca', 'es', 'en', 'ar', 'fa']) {
    const messages = JSON.parse(
      readFileSync(
        join(import.meta.dir, `../../../../packages/shared/i18n/locales/${locale}/onboarding.json`),
        'utf8',
      ),
    ) as Record<string, string>;
    for (const key of [
      'errorSummary',
      'documentChooseError',
      'documentNieNumberTitle',
      'documentPassportNumberTitle',
      'documentOtherDetailsTitle',
      'documentNameLabel',
      'documentNameRequired',
      'documentNumberLabel',
      'errorBirthYear',
      'errorBirthDayRange',
      'errorBirthMonthRange',
      'errorBirthYearFormat',
      'errorBirthDayRequired',
      'errorBirthMonthRequired',
      'errorBirthYearRequired',
      'errorBirthDayInMonth',
      'errorBirthDateFuture',
      'errorInvalidDate',
      'termsPointPurposeTitle',
      'termsPointPurposeBody',
      'termsPointProtectedTitle',
      'termsPointProtectedBody',
      'termsPointPrivateTitle',
      'termsPointPrivateBody',
      'termsPointControlTitle',
      'termsPointControlBody',
      'termsReadFullAction',
      'termsHideFullAction',
    ]) {
      expect(messages[key]).toBeTruthy();
    }
  }
});
