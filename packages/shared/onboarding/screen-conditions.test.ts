/**
 * Screens that depend on an answer (RAPP-715): the rule, the ordering rule
 * and her walk through them.
 */
import { describe, expect, test } from 'bun:test';
import { nextWizardScreen, previousWizardScreen, type CustomWizardScreen } from './intake';
import { branchesAfterParents, conditionHolds, familyNumbers } from './screen-conditions';
import { documentDetailScreen, opensDetailScreen } from './screen-texts';

describe('the rule', () => {
  test('one answer among them, or one of them ticked', () => {
    expect(conditionHolds(['yes'], 'yes')).toBe(true);
    expect(conditionHolds(['yes'], 'no')).toBe(false);
    expect(conditionHolds(['b'], ['a', 'b'])).toBe(true);
    expect(conditionHolds(['b'], ['a'])).toBe(false);
    expect(conditionHolds(['yes'], undefined)).toBe(false);
    expect(conditionHolds(['yes'], '')).toBe(false);
  });

  test('the document follow-up is one screen per answer', () => {
    expect(documentDetailScreen('passport')).toBe('documentation-passport');
    expect(documentDetailScreen('nie')).toBe('documentation-nie');
    expect(documentDetailScreen('other')).toBe('documentation-other');
    expect(documentDetailScreen('none')).toBeNull();
    expect(opensDetailScreen('applicant-status-details', 'other')).toBe(true);
  });
});

describe('the ordering rule', () => {
  test('each follow-up right after its parent, depth first, siblings in their order', () => {
    const parents: Record<string, string> = { b: 'a', c: 'a', d: 'b' };
    expect(branchesAfterParents(['a', 'x', 'c', 'b', 'd', 'y'], (key) => parents[key])).toEqual([
      'a',
      'c',
      'b',
      'd',
      'x',
      'y',
    ]);
  });

  test('a follow-up whose parent is not in the list keeps its place', () => {
    expect(branchesAfterParents(['a', 'b'], (key) => (key === 'b' ? 'gone' : null))).toEqual([
      'a',
      'b',
    ]);
  });

  test('a family is numbered 3, 3a, 3a.1, 3b', () => {
    const children: Record<string, string[]> = { p: ['x', 'y'], x: ['z'] };
    expect(
      familyNumbers<string>('p', '3', (key) => children[key] ?? []).map((each) => each.number),
    ).toEqual(['3', '3a', '3a.1', '3b']);
  });
});

describe('her walk', () => {
  const answered = new Set<never>();
  const plan: CustomWizardScreen[] = [
    { id: 'p', afterScreen: 'season', isAnswered: false },
    {
      id: 'x',
      afterScreen: 'season',
      isAnswered: false,
      parent: 'custom:p',
      opensWhen: [{ fieldId: 'q1', values: ['yes'] }],
    },
    {
      id: 'z',
      afterScreen: 'season',
      isAnswered: false,
      parent: 'custom:x',
      opensWhen: [
        { fieldId: 'q2', values: ['yes'] },
        { fieldId: 'q1', values: ['yes'] },
      ],
    },
  ];
  const after = (answers: Record<string, unknown>) =>
    nextWizardScreen('custom:p', answered, plan, undefined, answers);

  test('a follow-up shows right after its parent only when her answer opens it', () => {
    expect(after({ q1: 'yes' })).toBe('custom:x');
    expect(after({ q1: 'no' })).toBe('summary');
  });

  test('a second level shows only when both answers match', () => {
    expect(nextWizardScreen('custom:x', answered, plan, undefined, { q1: 'yes', q2: 'yes' })).toBe(
      'custom:z',
    );
    expect(nextWizardScreen('custom:x', answered, plan, undefined, { q1: 'yes', q2: 'no' })).toBe(
      'summary',
    );
    expect(nextWizardScreen('custom:p', answered, plan, undefined, { q1: 'no', q2: 'yes' })).toBe(
      'summary',
    );
  });

  test('Back from a screen after a closed follow-up skips it', () => {
    expect(previousWizardScreen('summary', answered, plan, undefined, { q1: 'no' })).toBe(
      'custom:p',
    );
    expect(previousWizardScreen('summary', answered, plan, undefined, { q1: 'yes' })).toBe(
      'custom:x',
    );
  });
});
