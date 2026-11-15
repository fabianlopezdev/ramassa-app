import { expect, test } from 'bun:test';
import {
  EMPTY_INTAKE_CATALOG,
  EMPTY_PROFILE_LAYOUT,
  type FieldPlacement,
  type IntakeCatalog,
  type ProfileField,
} from '@ramassa/shared/intake-builder';
import { fixedScreenLockKeys, namesDeletionLockKey } from './screen-hiding';

function field(id: string, systemKey: ProfileField['systemKey']): ProfileField {
  return { id, systemKey } as ProfileField;
}

function placed(fieldId: string, screenKey: string): FieldPlacement {
  return { id: `p-${fieldId}`, fieldId, surface: 'onboarding', screenKey } as FieldPlacement;
}

function catalogWith(placements: readonly FieldPlacement[]): IntakeCatalog {
  return {
    ...EMPTY_INTAKE_CATALOG,
    layout: {
      ...EMPTY_PROFILE_LAYOUT,
      fields: [field('first', 'first_name'), field('last', 'last_name'), field('phone', 'phone')],
      placements,
    },
  };
}

test('the screen that asks her names cannot be deleted, and says why (RAPP-785)', () => {
  const catalog = catalogWith([placed('first', 'identity'), placed('last', 'identity')]);
  expect(namesDeletionLockKey(catalog, ['identity'])).toBe('deleteLockedNames');
});

test('once her names are asked elsewhere, the screen is deleted like any other (RAPP-785)', () => {
  const catalog = catalogWith([
    placed('first', 'logistics'),
    placed('last', 'logistics'),
    placed('phone', 'identity'),
  ]);
  expect(namesDeletionLockKey(catalog, ['identity'])).toBeNull();
  expect(namesDeletionLockKey(catalog, ['logistics'])).toBe('deleteLockedNames');
});

test('a screen whose follow-up asks her names cannot be deleted either (RAPP-785)', () => {
  const catalog = catalogWith([placed('last', 'documentation-nie')]);
  expect(namesDeletionLockKey(catalog, ['documentation', 'documentation-nie'])).toBe(
    'deleteLockedDependentNames',
  );
  // A Ramassà screen's placements name it by its id, without `custom:`.
  const custom = catalogWith([placed('first', 'abc')]);
  expect(namesDeletionLockKey(custom, ['custom:abc'])).toBe('deleteLockedNames');
});

test("a legal form's fixed screens give that form's reasons, never Onboarding's (RAPP-785)", () => {
  expect(fixedScreenLockKeys({ systemScreen: 'authorization_sign' })).toEqual({
    hide: 'onboardingBoard.hideLockedClosing',
    addDependent: 'onboardingBoard.addDependentLockedClosing',
  });
  expect(fixedScreenLockKeys({ systemScreen: 'terms_sign' }).addDependent).toBe(
    'onboardingBoard.addDependentLockedClosing',
  );
  expect(fixedScreenLockKeys({ systemScreen: 'reregistration' })).toEqual({
    hide: 'onboardingBoard.hideLockedLegal',
    addDependent: 'onboardingBoard.addDependentLockedLegal',
  });
});
