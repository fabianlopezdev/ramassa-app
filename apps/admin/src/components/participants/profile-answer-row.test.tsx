/**
 * One field on her page (RAPP-653): the answer with who gave it, a locked
 * placeholder with the level the reader lacks (never the value), Edit only
 * where the team may write, and the editor under the row.
 */
import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { ProfileAnswerRow, type ProfileAnswerRowProps } from './profile-answer-row';

function props(overrides: Partial<ProfileAnswerRowProps> = {}): ProfileAnswerRowProps {
  return {
    name: 'Municipi',
    value: 'Vic',
    source: 'Marta Puig · 20 Oct',
    lockedLevel: null,
    choice: null,
    hasChoiceColumn: false,
    canEdit: true,
    isEditing: false,
    onToggleEdit: () => undefined,
    testId: 'fitxa-field-city',
    ...overrides,
  };
}

test('the answer reads with who gave it and when', () => {
  const view = render(<ProfileAnswerRow {...props()} />);
  expect(view.getByTestId('fitxa-field-city-value').textContent).toBe('Vic');
  expect(view.getByTestId('fitxa-field-city-source').textContent).toBe('Marta Puig · 20 Oct');
});

test('a locked row shows the level it needs, never the value or its source, and no Edit', () => {
  const view = render(
    <ProfileAnswerRow {...props({ lockedLevel: 'sensitive', value: 'secret', canEdit: false })} />,
  );
  expect(view.getByTestId('fitxa-field-city-value').textContent).not.toContain('secret');
  expect(view.getByTestId('fitxa-field-city-value').textContent).toContain('sensitive');
  expect(view.getByTestId('fitxa-field-city-source').textContent).toBe('');
  expect(view.queryByTestId('fitxa-field-city-edit')).toBeNull();
});

test('Edit opens the editor under the row', () => {
  const onToggleEdit = mock(() => undefined);
  const view = render(
    <ProfileAnswerRow {...props({ onToggleEdit, isEditing: true, editor: <p>input</p> })} />,
  );
  fireEvent.click(view.getByTestId('fitxa-field-city-edit'));
  expect(onToggleEdit).toHaveBeenCalledTimes(1);
  expect(view.getByTestId('fitxa-field-city-editor').textContent).toBe('input');
});
