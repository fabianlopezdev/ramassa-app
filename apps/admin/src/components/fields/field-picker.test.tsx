/**
 * The field picker (RAPP-651): a field already here is ticked and cannot be
 * picked, one asked elsewhere says where, a condition brings its controlling
 * field and is added after it, Space ticks from the keyboard and Enter adds.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { ProfileField, ProfileLayout } from '@ramassa/shared/intake-builder';
import { FieldPicker, type FieldPickState } from './field-picker';

const SIZES = '5eed0000-0000-4000-8093-000000000001';
const HEALTH = '5eed0000-0000-4000-8093-000000000002';

function field(id: string, sectionId: string, overrides: Partial<ProfileField> = {}): ProfileField {
  return {
    id,
    sectionId,
    kind: 'custom',
    builtinKey: null,
    type: 'short_text',
    label: { ca: id },
    help: null,
    privacy: 'normal',
    defaultRequired: false,
    settings: {},
    sortOrder: 0,
    isArchived: false,
    createdAt: '2026-10-23T10:00:00Z',
    createdBy: null,
    createdByName: null,
    hasAnswers: false,
    options: [],
    ...overrides,
  };
}

const LAYOUT: ProfileLayout = {
  sections: [
    { id: SIZES, key: 'sizes', title: { ca: 'Talles' }, isBuiltin: true },
    { id: HEALTH, key: 'health_needs', title: { ca: 'Salut' }, isBuiltin: true },
  ],
  fields: [
    field('gloves', SIZES),
    field('shoes', SIZES),
    field('allergies', HEALTH),
    field('detail', HEALTH, { showWhen: { fieldId: 'allergies', optionId: 'yes' } }),
  ],
  placements: [],
};

const STATES: Record<string, FieldPickState> = {
  gloves: { kind: 'placed', note: 'here' },
  shoes: { kind: 'blocked', note: 'step 6' },
};

function open(onConfirm: (ids: readonly string[]) => Promise<void>) {
  return render(
    <FieldPicker
      layout={LAYOUT}
      isOpen
      onOpenChange={() => undefined}
      title="Add a field"
      initialSectionId={SIZES}
      stateOf={(each) => STATES[each.id] ?? { kind: 'free' }}
      onConfirm={onConfirm}
    />,
  );
}

test('a field here is ticked and stays so; one elsewhere says where', () => {
  const view = open(async () => undefined);
  const gloves = view.getByTestId('field-picker-field-gloves');
  expect(gloves.getAttribute('aria-selected')).toBe('true');
  expect(gloves.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(gloves);
  expect(gloves.getAttribute('aria-selected')).toBe('true');
  const shoes = view.getByTestId('field-picker-field-shoes');
  expect(shoes.textContent).toContain('step 6');
  fireEvent.click(shoes);
  expect(shoes.getAttribute('aria-selected')).toBe('false');
  expect((view.getByTestId('field-picker-confirm') as HTMLButtonElement).disabled).toBeTrue();
});

test('a condition brings its controlling field, which is added first', async () => {
  const onConfirm = mock<(ids: readonly string[]) => Promise<void>>(async () => undefined);
  const view = open(onConfirm);
  fireEvent.click(view.getByTestId('field-picker-section-health_needs'));
  const detail = view.getByTestId('field-picker-field-detail');
  // Space ticks from the keyboard.
  fireEvent.keyDown(detail, { key: ' ' });
  expect(view.getByTestId('field-picker-field-allergies').getAttribute('aria-selected')).toBe(
    'true',
  );
  // Enter adds what is picked.
  fireEvent.keyDown(detail, { key: 'Enter' });
  await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  expect(onConfirm.mock.calls[0]?.[0]).toEqual(['allergies', 'detail']);
});

test('the search looks across every section', () => {
  const view = open(async () => undefined);
  fireEvent.change(view.getByTestId('field-picker-search'), { target: { value: 'ALLERG' } });
  expect(view.queryByTestId('field-picker-field-gloves')).toBeNull();
  expect(view.getByTestId('field-picker-field-allergies')).toBeTruthy();
});
