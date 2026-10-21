import { expect, test } from 'bun:test';
import {
  INTAKE_QUESTIONS,
  nextWizardScreen,
  previousWizardScreen,
  wizardScreenPosition,
} from './intake';

test('review leads to a distinct explanation before full terms, even when all answers were supplied', () => {
  const answered = new Set(INTAKE_QUESTIONS);
  expect(nextWizardScreen('start', answered)).toBe('summary');
  expect(nextWizardScreen('summary', answered)).toBe('terms-intro');
  expect(nextWizardScreen('terms-intro', answered)).toBe('terms');
  expect(previousWizardScreen('terms', answered)).toBe('terms-intro');
  expect(previousWizardScreen('terms-intro', answered)).toBe('summary');
  expect(wizardScreenPosition('terms-intro', answered)).toEqual({ step: 2, total: 3 });
  expect(wizardScreenPosition('terms', answered)).toEqual({ step: 3, total: 3 });
});
test('the full configured flow ends with explanation at 14 and full terms at 15', () => {
  const topics = ['transport', 'discovery', 'participation'].map((id) => ({
    id,
    afterScreen: 'logistics' as const,
    isAnswered: false,
  }));
  const unanswered = new Set<(typeof INTAKE_QUESTIONS)[number]>();
  expect(wizardScreenPosition('summary', unanswered, topics)).toEqual({ step: 13, total: 15 });
  expect(wizardScreenPosition('terms-intro', unanswered, topics)).toEqual({ step: 14, total: 15 });
  expect(wizardScreenPosition('terms', unanswered, topics)).toEqual({ step: 15, total: 15 });
});
