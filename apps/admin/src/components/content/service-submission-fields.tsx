import { Input } from '@/components/ui/input';
import { type ReactNode } from 'react';
import { useFormContext, type UseFormRegisterReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import type { AdminServiceCategory } from '@ramassa/shared/services';
import { ServiceMetadataFields } from './service-metadata-fields';

export interface ServiceFormValues {
  readonly providerName: string;
  readonly location: string;
  readonly zone: string;
  readonly costType: 'free' | 'paid' | 'subsidized' | 'varies';
  readonly costAmount: string;
  readonly costDetails: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly contactEmail: string;
  readonly contactRole: string;
  readonly schedule: string;
  readonly externalUrl: string;
  readonly availability: 'available' | 'waiting_list' | 'by_appointment' | 'full';
  readonly metadata: Record<string, unknown>;
}

export function serviceMetadataDefaults(
  category: AdminServiceCategory,
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  return Object.fromEntries(
    category.definition.fields.map((field) => [
      field.key,
      existing[field.key] ??
        (field.type === 'boolean' ? false : field.type === 'string-array' ? [] : ''),
    ]),
  );
}

export function normalizedServiceMetadata(
  category: AdminServiceCategory,
  values: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    category.definition.fields.flatMap((field) => {
      const value = values[field.key];
      if (value === '' || value === undefined || (Array.isArray(value) && value.length === 0)) {
        return [];
      }
      return [[field.key, value]];
    }),
  );
}

interface ServiceSubmissionFieldsProps {
  readonly categories: readonly AdminServiceCategory[];
  readonly category: AdminServiceCategory;
  readonly categoryId: string;
  readonly language: SupportedLanguage;
  readonly labelNamespace: 'services' | 'entity-services';
  readonly onCategoryChange: (categoryId: string) => void;
  readonly contactNameField?: ReactNode;
  readonly children: ReactNode;
}

export function ServiceSubmissionFields({
  categories,
  category,
  categoryId,
  language,
  labelNamespace,
  onCategoryChange,
  contactNameField,
  children,
}: ServiceSubmissionFieldsProps) {
  const { t } = useTranslation([labelNamespace, 'services']);
  const form = useFormContext<ServiceFormValues>();

  return (
    <>
      <label className="flex max-w-md flex-col gap-2">
        <span className="text-sm font-medium">{t(`${labelNamespace}:fieldCategory`)}</span>
        <select
          required
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          data-testid="service-category"
          value={categoryId}
          onChange={(event) => onCategoryChange(event.target.value)}
        >
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name[language] ?? item.name.ca}
            </option>
          ))}
        </select>
      </label>
      {children}
      <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <ServiceTextField
          label={t(`${labelNamespace}:fieldProviderName`)}
          testId="service-provider"
          registration={form.register('providerName')}
        />
        <ServiceTextField
          label={t(`${labelNamespace}:fieldLocation`)}
          testId="service-location"
          registration={form.register('location')}
        />
        <ServiceTextField
          label={t(`${labelNamespace}:fieldZone`)}
          testId="service-zone"
          registration={form.register('zone')}
        />
        <ServiceSelectField
          label={t(`${labelNamespace}:fieldCostType`)}
          testId="service-cost-type"
          registration={form.register('costType')}
          options={[
            ['free', t('services:costFree')],
            ['paid', t('services:costPaid')],
            ['subsidized', t('services:costSubsidized')],
            ['varies', t('services:costVaries')],
          ]}
        />
        <ServiceTextField
          label={t(`${labelNamespace}:fieldCostAmount`)}
          testId="service-cost-amount"
          type="number"
          registration={form.register('costAmount')}
        />
        <ServiceTextField
          label={t(`${labelNamespace}:fieldCostDetails`)}
          testId="service-cost-details"
          registration={form.register('costDetails')}
        />
        {contactNameField ?? (
          <ServiceTextField
            label={t(`${labelNamespace}:fieldContactName`)}
            testId="service-contact-name"
            registration={form.register('contactName')}
          />
        )}
        <ServiceTextField
          label={t(`${labelNamespace}:fieldContactPhone`)}
          testId="service-contact-phone"
          registration={form.register('contactPhone')}
        />
        <ServiceTextField
          label={t(`${labelNamespace}:fieldContactEmail`)}
          testId="service-contact-email"
          type="email"
          registration={form.register('contactEmail')}
        />
        <ServiceTextField
          label={t(`${labelNamespace}:fieldContactRole`)}
          testId="service-contact-role"
          registration={form.register('contactRole')}
        />
        <ServiceTextField
          label={t(`${labelNamespace}:fieldSchedule`)}
          testId="service-schedule"
          registration={form.register('schedule')}
        />
        <ServiceTextField
          label={t(`${labelNamespace}:fieldExternalUrl`)}
          testId="service-external-url"
          type="url"
          registration={form.register('externalUrl')}
        />
        <ServiceSelectField
          label={t(`${labelNamespace}:fieldAvailability`)}
          testId="service-availability"
          registration={form.register('availability')}
          options={[
            ['available', t('services:availabilityAvailable')],
            ['waiting_list', t('services:availabilityWaitingList')],
            ['by_appointment', t('services:availabilityByAppointment')],
            ['full', t('services:availabilityFull')],
          ]}
        />
      </section>
      <ServiceMetadataFields category={category.definition} language={language} />
    </>
  );
}

function ServiceTextField({
  label,
  testId,
  type = 'text',
  registration,
}: {
  readonly label: string;
  readonly testId: string;
  readonly type?: string;
  readonly registration: UseFormRegisterReturn;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Input type={type} data-testid={testId} {...registration} />
    </label>
  );
}

function ServiceSelectField({
  label,
  testId,
  registration,
  options,
}: {
  readonly label: string;
  readonly testId: string;
  readonly registration: UseFormRegisterReturn;
  readonly options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        data-testid={testId}
        {...registration}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
