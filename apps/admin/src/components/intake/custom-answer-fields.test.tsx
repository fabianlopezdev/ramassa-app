/**
 * The web referral form names what does not fit a staff question, in the
 * words her wizard uses (RAPP-610).
 */
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import type { IntakeScreen } from '@ramassa/shared/intake-builder';
import { customAnswerErrors, CustomAnswerFields } from './custom-answer-fields';

const t = (key: string, values?: Record<string, unknown>) =>
  values === undefined ? key : `${key} ${JSON.stringify(values)}`;

const screen: IntakeScreen = {
  id: 'screen',
  title: { ca: 'Dades' },
  intro: null,
  afterScreen: 'logistics',
  isArchived: false,
  questions: [
    {
      id: 'children',
      screenId: 'screen',
      type: 'number',
      label: { ca: 'Quants fills?' },
      help: null,
      privacy: 'normal',
      placements: ['entity_form'],
      isArchived: false,
      settings: { integer: true, min: 0, max: 15 },
      options: [],
    },
    {
      id: 'email',
      screenId: 'screen',
      type: 'email',
      label: { ca: 'Correu' },
      help: null,
      privacy: 'personal',
      placements: ['entity_form'],
      isArchived: false,
      settings: {},
      options: [],
    },
  ],
};

test('each answer that does not fit gets its own message; empty and fitting ones none', () => {
  expect(customAnswerErrors([screen], { children: 2.5, email: 'ana@example' }, t)).toEqual({
    children: 'onboarding:customErrorNumberWhole',
    email: 'onboarding:customErrorEmail',
  });
  expect(customAnswerErrors([screen], { children: 3, email: null }, t)).toEqual({});
});

test('the message shows under its own question', () => {
  const view = render(
    <CustomAnswerFields
      screens={[screen]}
      values={{}}
      prefix="referral-custom"
      language="ca"
      errors={{ children: 'Escriu un nombre sencer.' }}
    />,
  );
  expect(view.getByTestId('referral-custom-children-error').textContent).toBe(
    'Escriu un nombre sencer.',
  );
  expect(view.queryByTestId('referral-custom-email-error')).toBeNull();
});
