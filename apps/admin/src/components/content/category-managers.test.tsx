import { createAdminI18n } from '@/lib/i18n';
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { KnowledgeCategoryRow } from '@ramassa/shared/knowledge';
import { parseServiceCategoryRow } from '@ramassa/shared/services';
import { GuideCategoryManager } from './guide-category-manager';
import { ServiceCategoryManager } from './service-category-manager';

function withI18n(node: React.ReactNode) {
  return <I18nextProvider i18n={createAdminI18n('ca')}>{node}</I18nextProvider>;
}

const name = (ca: string) => ({ ca, es: ca, en: ca, fr: ca, ar: ca, fa: ca });

const guideCategories: KnowledgeCategoryRow[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: name('Drets i asil'),
    slug: 'rights-asylum',
    icon: 'scale',
    color: 'indigo',
    sort_order: 10,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: name('Recursos generals'),
    slug: 'general-resources',
    icon: 'book',
    color: 'teal',
    sort_order: 20,
  },
];

const serviceCategory = parseServiceCategoryRow({
  id: '00000000-0000-4000-8000-000000000003',
  name: name('Habitatge'),
  slug: 'housing',
  icon: 'home',
  color: 'amber',
  sort_order: 10,
  metadata_schema: { fields: [] },
  created_at: '2026-11-18T10:00:00.000Z',
  updated_at: '2026-11-18T10:00:00.000Z',
});

test('the guide categories screen lists each category with its colour and its actions', () => {
  const screen = render(withI18n(<GuideCategoryManager initialCategories={guideCategories} />));

  expect(screen.getByText('Categories de la base de coneixement')).toBeTruthy();
  for (const category of guideCategories) {
    const row = screen.getByTestId(`guide-category-row-${category.id}`);
    expect(row.textContent).toContain(category.name.ca ?? category.slug);
    expect(row.textContent).toContain(category.slug);
    expect(row.querySelector('[data-slot="category-color-swatch"]')).not.toBeNull();
    expect(screen.getByTestId(`guide-category-edit-${category.id}`)).toBeTruthy();
    expect(screen.getByTestId(`guide-category-delete-${category.id}`)).toBeTruthy();
  }
  expect(screen.getByTestId('guide-category-editor').textContent).toContain('Nova categoria');
});

test('guide and service categories pick their colour with the one shared picker', () => {
  const pickers: Array<{ slot: string | null; text: string | null }> = [];
  const guide = render(withI18n(<GuideCategoryManager initialCategories={guideCategories} />));
  const guidePicker = guide.getByTestId('guide-category-color');
  pickers.push({ slot: guidePicker.getAttribute('data-slot'), text: guidePicker.textContent });
  guide.unmount();

  const service = render(
    withI18n(<ServiceCategoryManager initialCategories={[serviceCategory]} />),
  );
  const servicePicker = service.getByTestId('service-category-color');
  pickers.push({ slot: servicePicker.getAttribute('data-slot'), text: servicePicker.textContent });

  for (const picker of pickers) {
    expect(picker.slot).toBe('select-trigger');
    expect(picker.text).toContain('Cel');
  }
  expect(
    service
      .getByTestId(`service-category-row-${serviceCategory.id}`)
      .querySelector('[data-slot="category-color-swatch"]'),
  ).not.toBeNull();
});
