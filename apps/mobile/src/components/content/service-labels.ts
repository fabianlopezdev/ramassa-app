/**
 * Translation keys for a service's status, cost and availability (RAPP-344),
 * as the web admin names them, and the way an extra field's value reads. An
 * option of a select or a list field reads through `services:option.<value>`.
 */
import type { SERVICE_CATEGORY_ICONS } from '@/lib/service-category-form';
import type { SymbolViewProps } from 'expo-symbols';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import type {
  ServiceAvailability,
  ServiceCostType,
  ServiceLifecycle,
  ServiceMetadataFieldDefinition,
  ServiceMetadataFieldType,
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

/** A service category's icon codes (the web admin's lucide names) as system symbols (RAPP-347). */
export const SERVICE_ICON_SYMBOLS = {
  house: { ios: 'house.fill', android: 'home', web: 'home' },
  languages: { ios: 'character.bubble.fill', android: 'translate', web: 'translate' },
  'briefcase-business': { ios: 'briefcase.fill', android: 'work', web: 'work' },
  scale: { ios: 'building.columns.fill', android: 'gavel', web: 'gavel' },
  'heart-pulse': { ios: 'heart.text.square.fill', android: 'monitor_heart', web: 'monitor_heart' },
  'graduation-cap': { ios: 'graduationcap.fill', android: 'school', web: 'school' },
  tickets: { ios: 'ticket.fill', android: 'confirmation_number', web: 'confirmation_number' },
  'file-text': { ios: 'doc.text.fill', android: 'description', web: 'description' },
  circle: { ios: 'circle.fill', android: 'circle', web: 'circle' },
} as const satisfies Record<(typeof SERVICE_CATEGORY_ICONS)[number], SymbolViewProps['name']>;

export const SERVICE_ICON_KEYS = {
  house: 'iconHouse',
  languages: 'iconLanguages',
  'briefcase-business': 'iconBriefcaseBusiness',
  scale: 'iconScale',
  'heart-pulse': 'iconHeartPulse',
  'graduation-cap': 'iconGraduationCap',
  tickets: 'iconTickets',
  'file-text': 'iconFileText',
  circle: 'iconCircle',
} as const satisfies Record<(typeof SERVICE_CATEGORY_ICONS)[number], string>;

export const SERVICE_FIELD_TYPE_KEYS = {
  select: 'fieldTypeSelect',
  'string-array': 'fieldTypeStringArray',
  boolean: 'fieldTypeBoolean',
  number: 'fieldTypeNumber',
  text: 'fieldTypeText',
  date: 'fieldTypeDate',
} as const satisfies Record<ServiceMetadataFieldType, string>;
