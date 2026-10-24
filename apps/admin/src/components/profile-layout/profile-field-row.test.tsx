/**
 * A field row of the Fitxa (RAPP-650): a built-in field ends in a lock, a
 * Ramassà one in Edit for a designer and in nothing for a reader; the creator
 * line names who added it.
 */
import { createAdminI18n } from '@/lib/i18n';
import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { I18nextProvider } from 'react-i18next';
import type { ProfileField } from '@ramassa/shared/intake-builder';
import { ProfileFieldRow, shortDate } from './profile-field-row';

function field(overrides: Partial<ProfileField> = {}): ProfileField {
  return {
    id: '5eed0000-0000-4000-8091-000000000001',
    sectionId: '5eed0000-0000-4000-8090-000000000001',
    kind: 'custom',
    builtinKey: null,
    type: 'short_text',
    label: { ca: 'Talla de guants' },
    help: null,
    privacy: 'normal',
    defaultRequired: false,
    settings: {},
    sortOrder: 0,
    isArchived: false,
    createdAt: '2026-10-23T10:00:00Z',
    createdBy: '5eed0000-0000-4000-8000-000000000097',
    createdByName: 'Pau Dissenya',
    hasAnswers: false,
    options: [],
    ...overrides,
  };
}

test('a Ramassà field opens with Edit for a designer', () => {
  const onEdit = mock(() => undefined);
  const view = render(
    <I18nextProvider i18n={createAdminI18n('ca')}>
      <ProfileFieldRow field={field()} surfaces={[]} handle={null} canEdit onEdit={onEdit} />
    </I18nextProvider>,
  );
  expect(view.container.textContent).toContain('creat per Pau Dissenya');
  fireEvent.click(view.getByTestId(`profile-field-edit-${field().id}`));
  expect(onEdit).toHaveBeenCalledTimes(1);
});

test('a reader gets no button', () => {
  const view = render(
    <ProfileFieldRow
      field={field()}
      surfaces={['onboarding']}
      handle={null}
      canEdit={false}
      onEdit={() => undefined}
    />,
  );
  expect(view.queryAllByRole('button')).toHaveLength(0);
});

test('a built-in field ends in a lock, never Edit', () => {
  const view = render(
    <ProfileFieldRow
      field={field({ kind: 'builtin', builtinKey: 'first_name', createdByName: null })}
      surfaces={['onboarding', 'entity_form']}
      handle={null}
      canEdit
      onEdit={() => undefined}
    />,
  );
  expect(view.queryAllByRole('button')).toHaveLength(0);
  expect(view.queryByTestId(`profile-field-edit-${field().id}`)).toBeNull();
});

test('a date shows its year only when it is not this year', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  expect(shortDate('2026-10-23T10:00:00Z', 'en', now)).not.toContain('2026');
  expect(shortDate('2025-10-23T10:00:00Z', 'en', now)).toContain('2025');
});
