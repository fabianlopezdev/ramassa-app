import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

const root = join(import.meta.dir, '..');
const onboardingDir = join(root, 'app/(app)/onboarding');
const welcome = readFileSync(join(onboardingDir, 'index.tsx'), 'utf8');
const background = readFileSync(join(onboardingDir, 'background.tsx'), 'utf8');
const documentation = readFileSync(join(onboardingDir, 'documentation.tsx'), 'utf8');
const logistics = readFileSync(join(onboardingDir, 'logistics.tsx'), 'utf8');
const equipment = readFileSync(join(onboardingDir, 'equipment.tsx'), 'utf8');
const terms = readFileSync(join(onboardingDir, 'terms.tsx'), 'utf8');
const optionChip = readFileSync(join(root, 'components/onboarding/option-chip.tsx'), 'utf8');
const questionHeadingPath = join(root, 'components/onboarding/onboarding-question-heading.tsx');
const summaryPath = join(root, 'components/onboarding/wizard-validation-summary.tsx');

describe('conversational onboarding controls', () => {
  test('contact, equipment, nationality and document choice use plain labels', () => {
    const questionHeading = Bun.file(questionHeadingPath);
    expect(questionHeading.size).toBeGreaterThan(0);
    const headingSource = readFileSync(questionHeadingPath, 'utf8');
    expect(headingSource).toContain('aria-hidden');
    expect(headingSource).toContain('accessibilityElementsHidden');
    expect(headingSource).toContain('importantForAccessibility="no-hide-descendants"');
    // Staff may reword a built-in question (RAPP-307): the app's label is the fallback.
    expect(background).toContain("label={wording.field('nationality', t('nationalityLabel'))}");
    expect(background).not.toContain('symbol=');
    expect(documentation).toContain('SelectionChoiceCard');
    expect(documentation).not.toContain('documentSymbol');
    expect(background).not.toContain("intro={t('backgroundIntro')}");
    expect(logistics).toContain("label={wording.field('city', t('cityLabel'))}");
    for (const source of [logistics, equipment]) {
      expect(source).toContain('<OnboardingQuestionHeading');
      expect(source).not.toContain('symbol=');
      expect(source).not.toContain('SymbolView');
    }
  });

  test('selection keeps typography stable and distinct from the solid primary action', () => {
    expect(optionChip).toContain('SelectionChoiceSurface');
    expect(optionChip).toContain('text-center text-form font-medium');
    expect(optionChip).not.toContain("isSelected ? 'font-bold'");
    expect(optionChip).not.toContain('border-primary bg-primary px-lg');
    expect(optionChip).not.toContain('text-white');
  });

  test('an empty submit presents one shared summary on every form step', () => {
    expect(Bun.file(summaryPath).size).toBeGreaterThan(0);
    for (const source of [welcome, background, documentation, logistics, equipment]) {
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

  test('terms explanations precede the always-visible full legal text', () => {
    const intro = readFileSync(join(root, 'components/onboarding/terms-introduction.tsx'), 'utf8');
    // The points and the body come from the published terms version, or the
    // bundled text when there is none (RAPP-613).
    const wording = readFileSync(join(root, 'lib/app-terms-wording.ts'), 'utf8');
    expect(wording).toContain("['Purpose', 'Protected', 'Private', 'Control']");
    expect(wording).toContain('`termsPoint${point}Title`');
    expect(wording).toContain("bundled('termsBody')");
    expect(intro).toContain('wording.points.map');
    expect(intro).toContain('<DataIcon');
    expect(intro).toContain("'termsReadFullAction'");
    expect(terms).toContain('<TermsBody body={wording.body} />');
    expect(terms).not.toContain('isFullTermsVisible');
    expect(terms).not.toContain('termsHideFullAction');
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
      'equipmentTitle',
      'equipmentIntro',
      'municipalityOptionalHint',
      'clearMunicipalityAction',
      'referenceEntitySupportQuestion',
      'referenceEntityRequired',
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
      'termsIntroTitle',
    ]) {
      expect(messages[key]).toBeTruthy();
    }
  }
});
