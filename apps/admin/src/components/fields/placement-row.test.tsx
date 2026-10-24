/**
 * A placed field's row (RAPP-651): Edit opens its panel, × asks to take it off
 * the surface, and a row the surface keeps has no × but the same columns.
 */
import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { PlacementRow, type PlacementRowProps } from './placement-row';

function props(overrides: Partial<PlacementRowProps> = {}): PlacementRowProps {
  return {
    name: 'Talla de guants',
    detail: 'Camp de Ramassà · Talles',
    type: 'short_text',
    privacy: 'normal',
    handle: null,
    required: { id: 'required-gloves', checked: false, onChange: () => undefined },
    isBusy: false,
    isEditing: false,
    onToggleEdit: () => undefined,
    testId: 'row',
    ...overrides,
  };
}

test('Edit opens the panel, × asks to remove', () => {
  const onToggleEdit = mock(() => undefined);
  const onRemove = mock(() => undefined);
  const view = render(<PlacementRow {...props({ onToggleEdit, onRemove })}>panel</PlacementRow>);
  expect(view.container.textContent).not.toContain('panel');
  fireEvent.click(view.getByTestId('row-edit'));
  fireEvent.click(view.getByTestId('row-remove'));
  expect(onToggleEdit).toHaveBeenCalledTimes(1);
  expect(onRemove).toHaveBeenCalledTimes(1);
  view.rerender(<PlacementRow {...props({ isEditing: true, onRemove })}>panel</PlacementRow>);
  expect(view.container.textContent).toContain('panel');
});

test('a row the surface keeps has no ×, and a locked switch says why', () => {
  const view = render(
    <PlacementRow
      {...props({
        required: {
          id: 'required-name',
          checked: true,
          lockReason: 'always required',
          onChange: () => undefined,
        },
      })}
    />,
  );
  expect(view.queryByTestId('row-remove')).toBeNull();
  expect(view.getByTestId('required-name').hasAttribute('disabled')).toBeTrue();
  expect(view.container.textContent).toContain('always required');
});
