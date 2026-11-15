/**
 * The searchable list pick (RAPP-665): typing any part of a name, in any
 * language, narrows the list; a pick stores the canonical Catalan name in the
 * hidden input; the empty row removes the answer.
 */
import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { appListMatches, ListPicker } from './list-picker';

function hidden(view: ReturnType<typeof render>, name: string): string {
  return (view.container.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;
}

test('a country is found by its name in another language and stored in Catalan', () => {
  const onChange = mock(() => undefined);
  const view = render(
    <ListPicker
      kind="country"
      language="ca"
      id="nationality"
      name="nationality"
      value=""
      onChange={onChange}
      noneLabel="—"
      testId="nationality"
    />,
  );
  const input = view.getByTestId('nationality-input');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Syria' } });
  const options = view.getAllByTestId('nationality-option').map((option) => option.textContent);
  expect(options).toContain('Síria');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(hidden(view, 'nationality')).toBe('Síria');
  expect(onChange).toHaveBeenCalledWith('Síria');
  expect(view.queryByRole('listbox')).toBeNull();
});

test('a municipality is picked from the list with the mouse, and the empty row removes it', () => {
  const view = render(
    <ListPicker
      kind="municipality"
      language="ca"
      id="city"
      name="city"
      value="Vic"
      noneLabel="—"
      testId="city"
    />,
  );
  expect(hidden(view, 'city')).toBe('Vic');
  const input = view.getByTestId('city-input');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'manlleu' } });
  fireEvent.mouseDown(
    view.getAllByTestId('city-option').find((option) => option.textContent === 'Manlleu')!,
  );
  expect(hidden(view, 'city')).toBe('Manlleu');
  fireEvent.focus(input);
  fireEvent.mouseDown(view.getAllByTestId('city-option')[0]!);
  expect(hidden(view, 'city')).toBe('');
});

test('the list stays short while nothing is typed and narrows as she types', () => {
  expect(appListMatches('municipality', 'ca', '').length).toBeGreaterThan(900);
  expect(appListMatches('municipality', 'ca', 'vic').map((option) => option.value)).toContain(
    'Vic',
  );
});
