import type {
  PlayerServiceRow,
  ServiceCategoryContract,
  ServiceMetadataFieldDefinition,
} from '@ramassa/shared/services';

export interface PlayerServiceMetadataFilterGroup {
  readonly key: string;
  readonly field: ServiceMetadataFieldDefinition;
  readonly options: readonly (string | number | boolean)[];
}

function observedOptions(
  field: ServiceMetadataFieldDefinition,
  services: readonly PlayerServiceRow[],
): readonly (string | number | boolean)[] {
  if (field.options !== undefined) return field.options;
  if (field.type === 'boolean') return [true, false];

  const values = new Set<string | number | boolean>();
  for (const service of services) {
    const raw = service.metadata[field.key];
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      values.add(raw);
    } else if (Array.isArray(raw)) {
      for (const value of raw) {
        if (typeof value === 'string' || typeof value === 'number') values.add(value);
      }
    }
  }
  return [...values].sort((first, second) => String(first).localeCompare(String(second)));
}

export function buildPlayerServiceMetadataFilterGroups(
  contract: ServiceCategoryContract,
  services: readonly PlayerServiceRow[],
): readonly PlayerServiceMetadataFilterGroup[] {
  return contract.filterFields.map((field) => ({
    key: field.key,
    field,
    options: observedOptions(field, services),
  }));
}

export function availableServiceZones(services: readonly PlayerServiceRow[]): readonly string[] {
  return [
    ...new Set(
      services.flatMap((service) =>
        service.zone === null || service.zone.length === 0 ? [] : [service.zone],
      ),
    ),
  ].sort((first, second) => first.localeCompare(second));
}
