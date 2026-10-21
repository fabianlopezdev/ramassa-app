import { expect, test } from 'bun:test';
import { createFieldFocusOwnership } from './field-focus-ownership';

function setup() {
  const changes: (string | null)[] = [];
  const owner = createFieldFocusOwnership((id) => changes.push(id));
  return { changes, owner };
}

test('touch-down transfers a single owner before the old native focus has blurred', () => {
  const { changes, owner } = setup();
  owner.focus('day');
  owner.press('month');
  owner.pressOut('day');
  owner.blur('day');
  owner.remove('day');
  expect(changes).toEqual(['day', 'month']);
  owner.focus('month');
  owner.pressOut('month');
  expect(changes).toEqual(['day', 'month']);
});

test('cancelled preview restores only the field that still has native focus', () => {
  const { changes, owner } = setup();
  owner.focus('day');
  owner.press('month');
  owner.pressOut('month');
  expect(changes).toEqual(['day', 'month', 'day']);
  owner.press('month');
  owner.blur('day');
  owner.pressOut('month');
  expect(changes.at(-1)).toBeNull();
});

test('delayed focus on the previous field cannot override the newer touch preview', () => {
  const { changes, owner } = setup();
  owner.press('month');
  owner.focus('day');
  owner.focus('month');
  owner.blur('day');
  expect(changes).toEqual(['month']);
});

test('programmatic focus transfers ownership and unmount only clears its own field', () => {
  const { changes, owner } = setup();
  owner.focus('day');
  owner.focus('month');
  owner.remove('day');
  expect(changes).toEqual(['day', 'month']);
  owner.remove('month');
  expect(changes).toEqual(['day', 'month', null]);
});
