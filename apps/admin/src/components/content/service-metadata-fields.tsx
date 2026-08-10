import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useController, useFormContext, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import type {
  ServiceCategoryDefinition,
  ServiceMetadataFieldDefinition,
} from '@ramassa/shared/services';

interface ServiceMetadataFormValues {
  readonly metadata: Record<string, unknown>;
}

export interface ServiceMetadataFieldsProps {
  readonly category: ServiceCategoryDefinition;
  readonly language: SupportedLanguage;
}

export function ServiceMetadataFields({ category, language }: ServiceMetadataFieldsProps) {
  return (
    <fieldset className="grid gap-4 rounded-lg border p-4">
      {category.fields.map((field) => (
        <div key={field.key} data-testid={`service-metadata-field-${field.key}`}>
          <ServiceMetadataField field={field} language={language} />
        </div>
      ))}
    </fieldset>
  );
}

function ServiceMetadataField({
  field,
  language,
}: {
  readonly field: ServiceMetadataFieldDefinition;
  readonly language: SupportedLanguage;
}) {
  const { t } = useTranslation('services');
  const { control } = useFormContext<ServiceMetadataFormValues>();
  const name = `metadata.${field.key}` as FieldPath<ServiceMetadataFormValues>;
  const controller = useController({ control, name });
  const id = `service-metadata-${field.key}`;
  const label = field.label[language];
  const required = field.required;

  if (field.type === 'string-array') {
    const selected = Array.isArray(controller.field.value)
      ? (controller.field.value as readonly string[])
      : [];
    return (
      <fieldset
        id={id}
        role="group"
        data-testid={id}
        className="flex flex-col gap-2"
        aria-label={label}
      >
        <legend className="text-sm font-medium">{label}</legend>
        <div className="flex flex-wrap gap-3">
          {(field.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid={`${id}-${option}`}
                checked={selected.includes(option)}
                onChange={(event) => {
                  controller.field.onChange(
                    event.target.checked
                      ? [...selected, option]
                      : selected.filter((value) => value !== option),
                  );
                }}
              />
              {t(`option.${option}`)}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          id={id}
          type="checkbox"
          data-testid={id}
          checked={controller.field.value === true}
          onChange={(event) => controller.field.onChange(event.target.checked)}
        />
        {label}
      </label>
    );
  }

  return (
    <label htmlFor={id} className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {field.type === 'select' ? (
        <select
          id={id}
          data-testid={id}
          required={required}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={typeof controller.field.value === 'string' ? controller.field.value : ''}
          onChange={controller.field.onChange}
        >
          <option value="">{t('selectPlaceholder')}</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {t(`option.${option}`)}
            </option>
          ))}
        </select>
      ) : field.type === 'text' ? (
        <Textarea
          id={id}
          data-testid={id}
          required={required}
          maxLength={2_000}
          value={typeof controller.field.value === 'string' ? controller.field.value : ''}
          onChange={controller.field.onChange}
        />
      ) : (
        <Input
          id={id}
          data-testid={id}
          type={field.type}
          required={required}
          min={field.type === 'number' ? field.minimum : undefined}
          value={
            typeof controller.field.value === 'string' || typeof controller.field.value === 'number'
              ? controller.field.value
              : ''
          }
          onChange={(event) =>
            controller.field.onChange(
              field.type === 'number'
                ? event.target.value === ''
                  ? undefined
                  : event.target.valueAsNumber
                : event.target.value,
            )
          }
        />
      )}
    </label>
  );
}
