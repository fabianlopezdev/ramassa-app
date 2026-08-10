import {
  getServiceCategoryContract,
  type ServiceCategoryContract,
  type ServiceCategorySlug,
} from './definitions';

export const SERVICE_COST_TYPES = ['free', 'subsidized', 'paid', 'varies'] as const;
export const SERVICE_AVAILABILITIES = [
  'available',
  'waiting_list',
  'by_appointment',
  'full',
] as const;

export type ServiceCostType = (typeof SERVICE_COST_TYPES)[number];
export type ServiceAvailability = (typeof SERVICE_AVAILABILITIES)[number];

export interface ServiceDirectoryFilters {
  readonly categoryId: string;
  readonly categorySlug: ServiceCategorySlug;
  readonly categoryContract?: ServiceCategoryContract;
  readonly zone?: string;
  readonly costType?: ServiceCostType;
  readonly availability?: ServiceAvailability;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ServiceDirectoryQuery<Query> {
  eq(column: string, value: unknown): Query;
  contains(column: string, value: unknown): Query;
}

export function applyServiceDirectoryFilters<Query extends ServiceDirectoryQuery<Query>>(
  query: Query,
  filters: ServiceDirectoryFilters,
): Query {
  let filteredQuery = query.eq('category_id', filters.categoryId);
  if (filters.zone !== undefined) filteredQuery = filteredQuery.eq('zone', filters.zone);
  if (filters.costType !== undefined) {
    filteredQuery = filteredQuery.eq('cost_type', filters.costType);
  }
  if (filters.availability !== undefined) {
    filteredQuery = filteredQuery.eq('availability', filters.availability);
  }
  if (filters.metadata !== undefined && Object.keys(filters.metadata).length > 0) {
    const contract = filters.categoryContract ?? getServiceCategoryContract(filters.categorySlug);
    const metadataFilter = contract.buildMetadataFilter(filters.metadata);
    filteredQuery = filteredQuery.contains('metadata', metadataFilter);
  }
  return filteredQuery;
}
