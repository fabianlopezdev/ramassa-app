/**
 * Translation keys for a service's status, cost and availability (RAPP-344),
 * as the web admin names them, and the way an extra field's value reads. An
 * option of a select or a list field reads through `services:option.<value>`.
 */
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import type {
  ServiceAvailability,
  ServiceCostType,
  ServiceLifecycle,
  ServiceMetadataFieldDefinition,
} from '@ramassa/shared/services';

export const SERVICE_STATUS_KEYS = {
  draft: 'statusDraft',
  pending: 'statusPending',
  approved: 'statusApproved',
  rejected: 'statusRejected',
  published: 'statusPublished',
  scheduled: 'statusScheduled',
  expired: 'statusExpired',
} as const satisfies Record<ServiceLifecycle, string>;

export const SERVICE_COST_KEYS = {
  free: 'costFree',
  paid: 'costPaid',
  subsidized: 'costSubsidized',
  varies: 'costVaries',
} as const satisfies Record<ServiceCostType, string>;

export const SERVICE_AVAILABILITY_KEYS = {
  available: 'availabilityAvailable',
  waiting_list: 'availabilityWaitingList',
  by_appointment: 'availabilityByAppointment',
  full: 'availabilityFull',
} as const satisfies Record<ServiceAvailability, string>;

/** An extra field's stored value as text, or null when it has none. */
export function formatMetadataValue(
  field: ServiceMetadataFieldDefinition,
  value: unknown,
  t: (key: string) => string,
): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (field.type === 'boolean')
    return value === true ? t('services:valueYes') : t('services:valueNo');
  if (field.type === 'select' && typeof value === 'string') return t(`services:option.${value}`);
  if (field.type === 'string-array' && Array.isArray(value)) {
    return value.length === 0
      ? null
      : value.map((option) => t(`services:option.${String(option)}`)).join(', ');
  }
  return String(value);
}

export function fieldLabel(field: ServiceMetadataFieldDefinition, language: SupportedLanguage) {
  return field.label[language] ?? field.label.ca;
}
