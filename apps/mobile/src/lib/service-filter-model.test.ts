import { expect, test } from 'bun:test';
import { createServiceCategoryContract, type PlayerServiceRow } from '@ramassa/shared/services';
import { buildPlayerServiceMetadataFilterGroups } from './service-filter-model';

test('a new filterable fixture field becomes a player filter group without screen code', () => {
  const contract = createServiceCategoryContract({
    slug: 'fixture',
    name: { ca: 'Prova', es: 'Prueba', en: 'Fixture', ar: 'اختبار', fa: 'آزمایش' },
    icon: 'flask',
    color: 'primary',
    sortOrder: 1,
    fields: [
      {
        key: 'delivery_window',
        label: {
          ca: 'Franja horària',
          es: 'Franja horaria',
          en: 'Delivery window',
          ar: 'الفترة الزمنية',
          fa: 'بازه زمانی',
        },
        type: 'select',
        required: false,
        filterable: true,
        options: ['morning', 'afternoon'],
      },
      {
        key: 'internal_notes',
        label: { ca: 'Notes', es: 'Notas', en: 'Notes', ar: 'ملاحظات', fa: 'یادداشت' },
        type: 'text',
        required: false,
        filterable: false,
      },
    ],
  });

  expect(buildPlayerServiceMetadataFilterGroups(contract, [] as PlayerServiceRow[])).toEqual([
    expect.objectContaining({ key: 'delivery_window', options: ['morning', 'afternoon'] }),
  ]);
});
