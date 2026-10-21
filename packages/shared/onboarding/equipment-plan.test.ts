import { expect, test } from 'bun:test';
import {
  INTAKE_QUESTIONS,
  nextWizardScreen,
  previousWizardScreen,
  screensToAsk,
  wizardScreenPosition,
  type IntakeQuestion,
} from './intake';

test('equipment is independent of contact and only asks missing sizes', () => {
  expect(nextWizardScreen('logistics', new Set())).toBe('equipment');
  expect(previousWizardScreen('equipment', new Set())).toBe('logistics');
  expect(
    screensToAsk(
      new Set(INTAKE_QUESTIONS.filter((q) => q !== 'clothing_size' && q !== 'shoe_size')),
    ),
  ).toEqual(['equipment']);
  expect(screensToAsk(new Set(INTAKE_QUESTIONS.filter((q) => q !== 'phone')))).toEqual([
    'logistics',
  ]);
  expect(screensToAsk(new Set(INTAKE_QUESTIONS.filter((q) => q !== 'shoe_size')))).toEqual([
    'equipment',
  ]);
  expect(wizardScreenPosition('equipment', new Set())).toEqual({ step: 5, total: 10 });
});

test('existing after-logistics staff screens follow the contact and equipment pair', () => {
  const custom = [{ id: 'transport', afterScreen: 'logistics' as const, isAnswered: false }];
  expect(nextWizardScreen('logistics', new Set(), custom)).toBe('equipment');
  expect(nextWizardScreen('equipment', new Set(), custom)).toBe('custom:transport');
  expect(previousWizardScreen('custom:transport', new Set(), custom)).toBe('equipment');
  const sizesGiven = new Set(['clothing_size', 'shoe_size'] as const);
  expect(nextWizardScreen('logistics', sizesGiven, custom)).toBe('custom:transport');
});

test('separate custom topics follow equipment and keep independent progress and back navigation', () => {
  const topics = ['transport', 'discovery', 'participation'].map((id) => ({
    id,
    afterScreen: 'logistics' as const,
    isAnswered: false,
  }));
  const unanswered = new Set<IntakeQuestion>();
  expect(nextWizardScreen('equipment', unanswered, topics)).toBe('custom:transport');
  expect(nextWizardScreen('custom:transport', unanswered, topics)).toBe('custom:discovery');
  expect(previousWizardScreen('custom:participation', unanswered, topics)).toBe('custom:discovery');
  expect(wizardScreenPosition('custom:participation', unanswered, topics)).toEqual({
    step: 8,
    total: 13,
  });
  expect(nextWizardScreen('custom:participation', unanswered, topics)).toBe('season');
  expect(
    nextWizardScreen(
      'custom:transport',
      unanswered,
      topics.map((topic) => (topic.id === 'discovery' ? { ...topic, isAnswered: true } : topic)),
    ),
  ).toBe('custom:participation');
});
