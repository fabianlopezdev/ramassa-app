import { createAdminI18n } from '@/lib/i18n';
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { EventCategoryRow } from '@ramassa/shared/events';
import { EventCategoryManager } from './event-category-manager';

function withI18n(node: React.ReactNode) {
  return <I18nextProvider i18n={createAdminI18n('ca')}>{node}</I18nextProvider>;
}

const name = (ca: string) => ({ ca, es: ca, en: ca, fr: ca, ar: ca, fa: ca });

const category = (id: string, ca: string, color: EventCategoryRow['color']): EventCategoryRow => ({
  id,
  name: name(ca),
  icon: 'dumbbell',
  color,
  sort_order: 10,
  created_at: '2026-11-20T10:00:00.000Z',
  updated_at: '2026-11-20T10:00:00.000Z',
});

const categories: EventCategoryRow[] = [
  category('00000000-0000-4000-8000-000000000001', 'Entrenaments', 'primary'),
  category('00000000-0000-4000-8000-000000000002', 'Cursos', 'sky'),
  // A database not yet migrated still returns an older name (RAPP-893).
  category('00000000-0000-4000-8000-000000000003', 'Sortides', 'chart-3'),
];

test('each activity category shows the swatch of its palette colour (RAPP-893)', () => {
  const screen = render(withI18n(<EventCategoryManager initialCategories={categories} />));

  for (const [row, color] of [
    [categories[0]!, 'primary'],
    [categories[1]!, 'sky'],
    [categories[2]!, 'pink'],
  ] as const) {
    const item = screen.getByTestId(`event-category-row-${row.id}`);
    expect(item.textContent).toContain(row.name.ca);
    expect(item.querySelector('[data-slot="category-color-swatch"]')).not.toBeNull();
    expect(item.querySelector(`[data-color="${color}"]`)).not.toBeNull();
  }
});

test('an activity category picks its colour with the shared picker, club colour first', () => {
  const screen = render(withI18n(<EventCategoryManager initialCategories={categories} />));
  const picker = screen.getByTestId('event-category-color');

  expect(picker.getAttribute('data-slot')).toBe('select-trigger');
  expect(picker.textContent).toContain('Color del club');
});
