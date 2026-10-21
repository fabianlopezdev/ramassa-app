import { expect, test } from 'bun:test';
import {
  INTAKE_QUESTIONS,
  nextWizardScreen,
  previousWizardScreen,
  screensToAsk,
  wizardScreenPosition,
} from './intake';

test('season topics advance separately before staff questions and summary', () => {
  const unanswered = new Set<(typeof INTAKE_QUESTIONS)[number]>();
  const topics = ['transport', 'discovery', 'participation'].map((id) => ({
    id,
    afterScreen: 'logistics' as const,
    isAnswered: false,
  }));
  expect(nextWizardScreen('season', unanswered)).toBe('supporting-entities');
  expect(nextWizardScreen('supporting-entities', unanswered)).toBe('participation-support');
  expect(previousWizardScreen('participation-support', unanswered)).toBe('supporting-entities');
  expect(nextWizardScreen('participation-support', unanswered)).toBe('summary');
  expect(wizardScreenPosition('season', unanswered, topics)).toEqual({ step: 9, total: 13 });
  expect(wizardScreenPosition('participation-support', unanswered, topics)).toEqual({
    step: 11,
    total: 13,
  });
  const custom = [{ id: 'follow-up', afterScreen: 'season' as const, isAnswered: false }];
  expect(nextWizardScreen('participation-support', unanswered, custom)).toBe('custom:follow-up');
  expect(previousWizardScreen('custom:follow-up', unanswered, custom)).toBe(
    'participation-support',
  );
});

test('each season topic skips independently when staff already supplied its answers', () => {
  const missing = (...questions: string[]) =>
    new Set(INTAKE_QUESTIONS.filter((q) => !questions.includes(q)));
  expect(screensToAsk(missing('applicant_status'))).toEqual(['season']);
  expect(screensToAsk(missing('supporting_entities'))).toEqual(['supporting-entities']);
  expect(screensToAsk(missing('childcare_need'))).toEqual(['participation-support']);
  expect(screensToAsk(missing('specific_needs'))).toEqual(['participation-support']);
  expect(nextWizardScreen('season', missing('childcare_need'))).toBe('participation-support');
});
