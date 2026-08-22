import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { OrganizationRow, StaffMember } from '@ramassa/shared/organization-settings';
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

const staffMember: StaffMember = {
  profile_id: '5eed0000-0000-4000-8000-000000000002',
  first_name: 'Núria',
  last_name: 'Soler',
  email: 'nuria@example.test',
  role: 'staff',
  is_active: true,
  invited_at: '2026-08-22T10:00:00Z',
};

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof OrganizationSettingsPanel>> = {},
) {
  const props: React.ComponentProps<typeof OrganizationSettingsPanel> = {
    organization,
    staffMembers: [staffMember],
    documents: [],
    documentQuery: '',
    entityManagement: <p>Entity settings</p>,
    accessToken: undefined,
    onSaveOrganization: mock(async () => undefined),
    onInviteStaff: mock(async () => undefined),
    onSetStaffRole: mock(async () => undefined),
    onRemoveStaff: mock(async () => undefined),
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

test('staff removal requires confirmation and document search delegates the typed query', async () => {
  const { props, view } = renderPanel({ documentQuery: 'asse', initialTab: 'staff' });

  fireEvent.click(view.getByRole('button', { name: /Remove access|remove/ }));
  expect(props.onRemoveStaff).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: /Confirm|confirm/ }));
  await waitFor(() => expect(props.onRemoveStaff).toHaveBeenCalledWith(staffMember.profile_id));

  view.unmount();
  const documentsPanel = renderPanel({ documentQuery: 'asse', initialTab: 'documents' });
  const documentsView = documentsPanel.view;
  const search = documentsView.getByLabelText(/Search documents|documentSearch/);
  expect((search as HTMLInputElement).value).toBe('asse');
  fireEvent.submit(search.closest('form')!);
  await waitFor(() => expect(documentsPanel.props.onSearchDocuments).toHaveBeenCalledWith('asse'));
});
