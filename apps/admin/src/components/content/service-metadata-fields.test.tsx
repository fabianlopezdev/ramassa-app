import { createAdminI18n } from '@/lib/i18n';
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import { FormProvider, useForm } from 'react-hook-form';
import { I18nextProvider } from 'react-i18next';
import {
  SERVICE_CATEGORY_DEFINITIONS,
  type ServiceCategoryDefinition,
} from '@ramassa/shared/services';
import { ServiceMetadataFields } from './service-metadata-fields';

function MetadataForm({ category }: { readonly category: ServiceCategoryDefinition }) {
  const form = useForm<{ metadata: Record<string, unknown> }>({
    defaultValues: { metadata: {} },
  });
  return (
    <FormProvider {...form}>
      <I18nextProvider i18n={createAdminI18n('ca')}>
        <ServiceMetadataFields category={category} language="ca" />
      </I18nextProvider>
    </FormProvider>
  );
}

test.each(SERVICE_CATEGORY_DEFINITIONS.map((category) => [category] as const))(
  '$slug renders every field from its category contract with the correct control',
  (category) => {
    const screen = render(<MetadataForm category={category} />);

    expect(screen.getAllByTestId(/^service-metadata-field-/)).toHaveLength(category.fields.length);
    for (const field of category.fields) {
      expect(screen.getByText(field.label.ca)).toBeTruthy();
      const control = screen.getByTestId(`service-metadata-${field.key}`);
      if (field.type === 'select') expect(control.tagName).toBe('SELECT');
      if (field.type === 'string-array') {
        expect(control.getAttribute('role')).toBe('group');
        for (const option of field.options ?? []) {
          expect(screen.getByTestId(`service-metadata-${field.key}-${option}`)).toBeTruthy();
        }
      }
      if (field.type === 'boolean') expect(control.getAttribute('type')).toBe('checkbox');
      if (field.type === 'number') expect(control.getAttribute('type')).toBe('number');
      if (field.type === 'text') expect(control.tagName).toBe('TEXTAREA');
      if (field.type === 'date') expect(control.getAttribute('type')).toBe('date');
    }
  },
);
