/**
 * The web referral form names what does not fit a staff question, in the
 * words her wizard uses (RAPP-610).
 */
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import type { IntakeScreen } from '@ramassa/shared/intake-builder';
import {
  customAnswerErrorsOf,
  CustomAnswerInput,
  readCustomAnswersOf,
} from './custom-answer-fields';

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
      type: 'number',
      label: { ca: 'Quants fills?' },
      help: null,
      privacy: 'normal',
      isArchived: false,
      settings: { integer: true, min: 0, max: 15 },
      options: [],
    },
    {
      id: 'email',
      type: 'email',
      label: { ca: 'Correu' },
      help: null,
      privacy: 'personal',
      isArchived: false,
      settings: {},
      options: [],
    },
  ],
};

test('each answer that does not fit gets its own message; empty and fitting ones none', () => {
  expect(
    customAnswerErrorsOf(screen.questions, { children: 2.5, email: 'ana@example' }, t),
  ).toEqual({
    children: 'onboarding:customErrorNumberWhole',
    email: 'onboarding:customErrorEmail',
  });
  expect(customAnswerErrorsOf(screen.questions, { children: 3, email: null }, t)).toEqual({});
});

test('the message shows under its own question', () => {
  const view = render(
    <>
      {screen.questions.map((question) => (
        <CustomAnswerInput
          key={question.id}
          question={question}
          value={undefined}
          prefix="referral-custom"
          language="ca"
          error={question.id === 'children' ? 'Escriu un nombre sencer.' : undefined}
        />
      ))}
    </>,
  );
  expect(view.getByTestId('referral-custom-children-error').textContent).toBe(
    'Escriu un nombre sencer.',
  );
  expect(view.queryByTestId('referral-custom-email-error')).toBeNull();
});

test('a country and a municipality are picked from the lists the app ships (RAPP-664, RAPP-665)', () => {
  const lists = (['country', 'municipality'] as const).map((type) => ({
    id: type,
    type,
    label: { ca: type },
    help: null,
    privacy: 'personal' as const,
    isArchived: false,
    settings: {},
    options: [],
  }));
  const view = render(
    <form data-testid="form">
      {lists.map((question) => (
        <CustomAnswerInput
          key={question.id}
          question={question}
          value={question.type === 'country' ? 'Marroc' : 'Vic'}
          prefix="fitxa"
          language="es"
        />
      ))}
    </form>,
  );
  const country = view.container.querySelector<HTMLInputElement>('#fitxa-country');
  const city = view.container.querySelector<HTMLInputElement>('#fitxa-municipality');
  // The canonical name is stored; she reads it in her language.
  expect(country?.value).toBe('Marruecos');
  expect(city?.value).toBe('Vic');
  // A search over the whole list (RAPP-665).
  expect(country?.getAttribute('role')).toBe('combobox');
  const answers = readCustomAnswersOf(
    new FormData(view.getByTestId('form') as HTMLFormElement),
    lists,
    'fitxa',
  );
  expect(answers).toEqual({ country: 'Marroc', municipality: 'Vic' });
});
