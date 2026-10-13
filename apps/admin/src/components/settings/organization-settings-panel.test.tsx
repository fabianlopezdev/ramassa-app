import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { OrganizationRow } from '@ramassa/shared/organization-settings';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { OrganizationSettingsPanel } from './organization-settings-panel';

const organization: OrganizationRow = {
  id: '5eed0000-0000-4000-8000-000000000001',
  name: 'AE Ramassà',
  slug: 'ramassa',
  logo_url: null,
  primary_color: '#0077B6',
  secondary_color: '#FFD166',
  default_language: 'ca',
  available_languages: ['ca', 'es', 'en', 'ar', 'fa'],
  locked_default_language: 'ca',
  contact_email: 'contacte@ramassa.cat',
  contact_phone: null,
};

const ALL_SETTINGS: ReadonlySet<PermissionCode> = new Set([
  'settings.organization',
  'settings.branding',
  'settings.documents',
  'entities.manage',
  'team.manage',
]);

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof OrganizationSettingsPanel>> = {},
) {
  const props: React.ComponentProps<typeof OrganizationSettingsPanel> = {
    organization,
    permissions: ALL_SETTINGS,
    team: <p>Team access</p>,
    photoHandoff: null,
    documents: [],
    documentQuery: '',
    entityManagement: <p>Entity settings</p>,
    accessToken: undefined,
    onSaveOrganization: mock(async () => undefined),
    onRegisterDocument: mock(async () => undefined),
    onSearchDocuments: mock(async () => undefined),
    ...overrides,
  };
  return { props, view: render(<OrganizationSettingsPanel {...props} />) };
}

test('organization settings saves validated defaults and preserves the Catalan grant lock', async () => {
  const { props, view } = renderPanel();
  expect(view.getByText(/Catalan|languageLocked/)).not.toBeNull();
  fireEvent.submit(view.getByTestId('organization-settings-form'));
  await waitFor(() => expect(props.onSaveOrganization).toHaveBeenCalledTimes(1));
});

test('save confirmation waits for completion, can be dismissed, and appears again on another save', async () => {
  let finishSave!: () => void;
  const onSaveOrganization = mock(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  const { view } = renderPanel({ onSaveOrganization });
  const form = view.getByTestId('organization-settings-form');
  fireEvent.submit(form);
  expect(view.getByRole('button', { name: /Working|working/ }).hasAttribute('disabled')).toBe(true);
  expect(view.queryByText(/Settings saved|^saved$/)).toBeNull();
  await act(async () => finishSave());
  expect(view.getByRole('status').textContent).toMatch(/Settings saved|saved/);
  fireEvent.click(view.getByRole('button', { name: /Close|close/ }));
  expect(view.queryByText(/Settings saved|^saved$/)).toBeNull();
  fireEvent.submit(form);
  await act(async () => finishSave());
  expect(view.getByRole('status').textContent).toMatch(/Settings saved|saved/);
});

test('failed save announces a dismissible error without claiming success', async () => {
  const { view } = renderPanel({
    onSaveOrganization: mock(async () => {
      throw new Error('Save failed');
    }),
  });
  fireEvent.submit(view.getByTestId('organization-settings-form'));
  await waitFor(() => expect(view.getByRole('alert').textContent).toContain('Save failed'));
  expect(view.queryByText(/Settings saved|^saved$/)).toBeNull();
  expect(view.getByRole('button', { name: /Save changes|^save$/ }).hasAttribute('disabled')).toBe(
    false,
  );
  fireEvent.click(view.getByRole('button', { name: /Close|close/ }));
  expect(view.queryByText('Save failed')).toBeNull();
});

test('document search delegates the typed query', async () => {
  const documentsPanel = renderPanel({ documentQuery: 'asse', initialTab: 'documents' });
  const documentsView = documentsPanel.view;
  const search = documentsView.getByLabelText(/Search documents|documentSearch/);
  expect((search as HTMLInputElement).value).toBe('asse');
  fireEvent.submit(search.closest('form')!);
  await waitFor(() => expect(documentsPanel.props.onSearchDocuments).toHaveBeenCalledWith('asse'));
});

test('a tab shows only to a holder of its permission (RAPP-231)', () => {
  const { view } = renderPanel({
    permissions: new Set(['settings.documents']),
    initialTab: 'staff',
  });
  expect(view.queryByRole('tab', { name: /tabTeam|Team/ })).toBeNull();
  expect(view.queryByRole('tab', { name: /tabOrganization|Organization/ })).toBeNull();
  expect(
    view.getByRole('tab', { name: /tabDocuments|Documents/ }).getAttribute('aria-selected'),
  ).toBe('true');
});

test('branding alone changes the colours but not the organization details', () => {
  const { view } = renderPanel({ permissions: new Set(['settings.branding']) });
  expect(view.getByLabelText(/primaryColor hex|Primary color hex/).hasAttribute('disabled')).toBe(
    false,
  );
  const nameInput = view.getByTestId('organization-settings-form').querySelector('input[required]');
  expect(nameInput?.hasAttribute('disabled')).toBe(true);
});
