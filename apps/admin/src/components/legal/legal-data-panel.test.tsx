/**
 * Dades legals (RAPP-699): consents with where each is asked, the signature
 * blocks of every form and the documents accepted, each opening its form.
 */
import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';
import { EMPTY_INTAKE_CATALOG, type IntakeCatalog } from '@ramassa/shared/intake-builder';

const saveConsent = mock(async () => 'id');
mock.module('@/lib/profile-layout-actions', () => ({
  useProfileLayoutActions: () => ({ saveConsent, archiveConsent: mock(async () => undefined) }),
}));
mock.module('@tanstack/react-router', () => ({
  Link: ({ to, children }: { readonly to: string; readonly children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
const { LegalDataPanel } = await import('./legal-data-panel');

const IMAGE = '00000000-0000-4000-8000-000000000001';
const OLD = '00000000-0000-4000-8000-000000000002';

const catalog: IntakeCatalog = {
  ...EMPTY_INTAKE_CATALOG,
  consents: [
    {
      id: OLD,
      key: 'antic',
      systemKey: null,
      name: { ca: 'Antic' },
      body: { ca: 'Ja no.' },
      isArchived: true,
    },
    {
      id: IMAGE,
      key: 'image_rights',
      systemKey: 'image_rights',
      name: { ca: "Drets d'imatge" },
      body: { ca: 'Autoritzo les fotos.' },
      isArchived: false,
    },
  ],
  consentPlacements: [
    {
      id: '00000000-0000-4000-8001-000000000001',
      consentId: IMAGE,
      surface: 'authorization',
      screenKey: null,
      sortOrder: 0,
      required: false,
    },
  ],
  blocks: [
    {
      id: '00000000-0000-4000-8002-000000000001',
      surface: 'entity_form',
      screenKey: null,
      kind: 'signature',
      body: { ca: "L'entitat signa." },
      sortOrder: 0,
    },
  ],
};

test('consents in use first, each with where it is asked; archived ones last', () => {
  const view = render(<LegalDataPanel catalog={catalog} canEdit />);
  const rows = view
    .getByTestId('legal-data-consents')
    .querySelectorAll('[data-testid^="legal-consent-"]');
  const keys = [...rows]
    .map((row) => row.getAttribute('data-testid'))
    .filter((id) => id !== null && !id.includes('-edit-') && id !== 'legal-consent-add');
  expect(keys).toEqual(['legal-consent-image_rights', 'legal-consent-antic']);
  expect(view.getByTestId('legal-consent-image_rights').textContent).toContain(
    'profileLayout.surface.authorization',
  );
  expect(view.getByTestId('legal-consent-antic').textContent).toContain('legalData.archived');
});

test('signatures and documents open their forms, read only', () => {
  const view = render(<LegalDataPanel catalog={catalog} canEdit={false} />);
  const signatures = view.getByTestId('legal-data-signatures');
  expect(signatures.textContent).toContain("L'entitat signa.");
  const links = [...view.container.querySelectorAll('a')].map((link) => link.getAttribute('href'));
  expect(links).toEqual(
    expect.arrayContaining([
      '/entities/referral-form',
      '/forms/authorization/consents',
      '/forms/terms',
      '/forms/authorization',
    ]),
  );
  expect(view.queryByTestId('legal-consent-add')).toBeNull();
  expect(view.queryByTestId('legal-consent-edit-image_rights')).toBeNull();
});

test('staff add a consent from the page', () => {
  const view = render(<LegalDataPanel catalog={catalog} canEdit />);
  fireEvent.click(view.getByTestId('legal-consent-add'));
  expect(view.getByTestId('legal-consent-form')).toBeTruthy();
});
