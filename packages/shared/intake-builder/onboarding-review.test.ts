import { describe, expect, test } from 'bun:test';
import {
  customStepKey,
  DEFAULT_WIZARD_FLOW,
  nextWizardScreen,
  type CustomWizardScreen,
} from '../onboarding/intake';
import {
  newVersionScreenKey,
  reviewFlow,
  reviewNotAsked,
  reviewPlan,
  reviewStepKey,
} from './onboarding-review';

const SCREEN = '5eed0000-0000-4000-8000-0000000006a1';

describe('the review of the screens saved as a Nova versió (RAPP-697)', () => {
  test('the database keys become wizard steps; an unknown one is dropped', () => {
    expect(reviewStepKey('logistics')).toBe('logistics');
    expect(reviewStepKey(SCREEN)).toBe(customStepKey(SCREEN));
    expect(reviewStepKey('summary')).toBeNull();
  });

  test('a detail screen marks the step it opens from; the summary and the terms mark nothing', () => {
    expect(newVersionScreenKey('documentation-details')).toBe('documentation');
    expect(newVersionScreenKey('equipment')).toBe('equipment');
    expect(newVersionScreenKey(SCREEN)).toBe(SCREEN);
    expect(newVersionScreenKey('summary')).toBeNull();
    expect(newVersionScreenKey('terms')).toBeNull();
  });

  test('the wizard walks only her screens to review, in order, then the summary', () => {
    const plan: CustomWizardScreen[] = [
      { id: SCREEN, afterScreen: 'logistics', isAnswered: true },
      { id: 'other', afterScreen: 'identity', isAnswered: false },
    ];
    const pending = ['logistics', customStepKey(SCREEN)] as const;
    // Answered before: her answers are filled in, the screens still show.
    const notAsked = reviewNotAsked(new Set(), pending);
    expect(notAsked.has('phone')).toBe(false);
    expect(notAsked.has('first_name')).toBe(true);
    const custom = reviewPlan(
      plan.map((screen) => (screen.id === SCREEN ? { ...screen, isAnswered: false } : screen)),
      pending,
    );
    const flow = reviewFlow(DEFAULT_WIZARD_FLOW, pending);
    const first = nextWizardScreen('start', notAsked, custom, flow);
    expect(first).toBe('logistics');
    const second = nextWizardScreen(first, notAsked, custom, flow);
    expect(second).toBe(customStepKey(SCREEN));
    expect(nextWizardScreen(second, notAsked, custom, flow)).toBe('summary');
  });
});
