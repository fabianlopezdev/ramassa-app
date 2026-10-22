/**
 * The login's language choice (RAPP-626): the three staff languages in one row,
 * the current one checked, and a tap or an arrow key switches the interface.
 */
import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { LanguageChoiceButtons } from './language-choice-row';

test('shows the three staff languages as one radio group with the current one checked', () => {
  const view = render(<LanguageChoiceButtons current="es" onChoose={() => {}} label="Language" />);
  const options = view.getAllByRole('radio');
  expect(view.getByRole('radiogroup', { name: 'Language' })).not.toBeNull();
  expect(options.map((option) => option.textContent)).toEqual(['Català', 'Español', 'English']);
  expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual([
    'false',
    'true',
    'false',
  ]);
  expect(options.map((option) => option.getAttribute('lang'))).toEqual(['ca', 'es', 'en']);
});

test('choosing a language switches the interface', () => {
  const onChoose = mock(() => {});
  const view = render(<LanguageChoiceButtons current="es" onChoose={onChoose} label="Language" />);
  fireEvent.click(view.getByRole('radio', { name: 'Català' }));
  expect(onChoose).toHaveBeenCalledWith('ca');
});

test('arrow keys move the choice along the row', () => {
  const onChoose = mock(() => {});
  const view = render(<LanguageChoiceButtons current="es" onChoose={onChoose} label="Language" />);
  fireEvent.keyDown(view.getByRole('radio', { name: 'Español' }), { key: 'ArrowRight' });
  expect(onChoose).toHaveBeenCalledWith('en');
  fireEvent.keyDown(view.getByRole('radio', { name: 'Català' }), { key: 'ArrowLeft' });
  expect(onChoose).toHaveBeenLastCalledWith('en');
});
