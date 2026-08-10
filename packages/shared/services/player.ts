import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import type { Database } from '../types/database';
import type { ServiceLocalizedLabel } from './definitions';
import {
  applyServiceDirectoryFilters,
  SERVICE_AVAILABILITIES,
  SERVICE_COST_TYPES,
  type ServiceAvailability,
  type ServiceCostType,
  type ServiceDirectoryFilters,
} from './filters';

export type ServiceContactPlatform = 'android' | 'ios' | 'web';

export interface PlayerServiceImageRow {
  readonly id: string;
  readonly url: string;
  readonly alt_text: ServiceLocalizedLabel;
  readonly position: number;
}

export interface PlayerServiceRow {
  readonly id: string;
  readonly category_id: string;
  readonly title: ServiceLocalizedLabel;
  readonly description: ServiceLocalizedLabel | null;
  readonly provider_name: string | null;
  readonly location: string | null;
  readonly zone: string | null;
  readonly cost_type: ServiceCostType;
  readonly cost_amount: number | null;
  readonly cost_details: string | null;
  readonly contact_name: string | null;
  readonly contact_phone: string | null;
  readonly contact_email: string | null;
  readonly contact_role: string | null;
  readonly schedule: string | null;
  readonly external_url: string | null;
  readonly availability: ServiceAvailability;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly images: readonly PlayerServiceImageRow[];
  readonly interested: boolean;
}

const completeLocalizedTextSchema = z.object({
  ca: z.string().min(1),
  es: z.string().min(1),
  en: z.string().min(1),
  ar: z.string().min(1),
  fa: z.string().min(1),
});

const playerServiceDatabaseRowSchema = z.object({
  id: z.uuid(),
  category_id: z.uuid(),
  title: completeLocalizedTextSchema,
  description: completeLocalizedTextSchema.nullable(),
  provider_name: z.string().nullable(),
  location: z.string().nullable(),
  zone: z.string().nullable(),
  cost_type: z.enum(SERVICE_COST_TYPES),
  cost_amount: z.number().nullable(),
  cost_details: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_email: z.email().nullable(),
  contact_role: z.string().nullable(),
  schedule: z.string().nullable(),
  external_url: z
    .url()
    .refine((url) => url.startsWith('https://'))
    .nullable(),
  availability: z.enum(SERVICE_AVAILABILITIES),
  metadata: z.record(z.string(), z.unknown()),
  images: z.array(
    z.object({
      id: z.uuid(),
      url: z.string().min(1),
      alt_text: completeLocalizedTextSchema,
      position: z.number().int().nonnegative(),
    }),
  ),
  interests: z.array(z.object({ id: z.uuid() })),
});

const PLAYER_SERVICE_COLUMNS =
  'id, category_id, title, description, provider_name, location, zone, cost_type, cost_amount, cost_details, contact_name, contact_phone, contact_email, contact_role, schedule, external_url, availability, metadata, updated_at, images:service_images(id, url, alt_text, position), interests:service_interests(id)';

function parsePlayerService(raw: unknown): PlayerServiceRow {
  const row = playerServiceDatabaseRowSchema.parse(raw);
  return {
    id: row.id,
    category_id: row.category_id,
    title: row.title,
    description: row.description,
    provider_name: row.provider_name,
    location: row.location,
    zone: row.zone,
    cost_type: row.cost_type,
    cost_amount: row.cost_amount,
    cost_details: row.cost_details,
    contact_name: row.contact_name,
    contact_phone: row.contact_phone,
    contact_email: row.contact_email,
    contact_role: row.contact_role,
    schedule: row.schedule,
    external_url: row.external_url,
    availability: row.availability,
    metadata: row.metadata,
    images: [...row.images].sort((first, second) => first.position - second.position),
    interested: row.interests.length > 0,
  };
}

export async function fetchPlayerServices(
  client: SupabaseClient<Database>,
  filters: ServiceDirectoryFilters,
  options: { readonly signal?: AbortSignal } = {},
): Promise<readonly PlayerServiceRow[]> {
  const base = client.from('services').select(PLAYER_SERVICE_COLUMNS);
  let query = applyServiceDirectoryFilters(base as never, filters) as typeof base;
  query = query.order('updated_at', { ascending: false }).order('id', { ascending: true });
  if (options.signal !== undefined) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return (data ?? []).map(parsePlayerService);
}

export async function fetchPlayerService(
  client: SupabaseClient<Database>,
  serviceId: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<PlayerServiceRow> {
  let query = client.from('services').select(PLAYER_SERVICE_COLUMNS).eq('id', serviceId);
  if (options.signal !== undefined) query = query.abortSignal(options.signal);
  const { data, error } = await query.single();
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return parsePlayerService(data);
}

export interface ServiceContactInput {
  readonly phone: string | null;
  readonly email: string | null;
  readonly location: string | null;
  readonly externalUrl: string | null;
}

export interface ServiceContactLinks {
  readonly phone: string | null;
  readonly email: string | null;
  readonly map: string | null;
  readonly external: string | null;
}

export function parseHttpsExternalUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function nativeMapUrl(location: string, platform: ServiceContactPlatform): string {
  const query = encodeURIComponent(location);
  if (platform === 'android') return `geo:0,0?q=${query}`;
  if (platform === 'ios') return `maps:0,0?q=${query}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function buildServiceContactLinks(
  input: ServiceContactInput,
  platform: ServiceContactPlatform,
): ServiceContactLinks {
  const phone = input.phone?.replace(/[^+\d*#,;]/g, '') ?? '';
  return {
    phone: phone.length > 0 ? `tel:${phone}` : null,
    email: input.email === null ? null : `mailto:${input.email}`,
    map: input.location === null ? null : nativeMapUrl(input.location, platform),
    external: parseHttpsExternalUrl(input.externalUrl),
  };
}

export function applyOptimisticServiceInterest(
  services: readonly PlayerServiceRow[],
  serviceId: string,
  interested: boolean,
): readonly PlayerServiceRow[] {
  return services.map((service) =>
    service.id === serviceId && service.interested !== interested
      ? { ...service, interested }
      : service,
  );
}

interface ServiceInterestRpcClient {
  rpc(
    name: 'set_service_interest',
    args: { readonly p_service_id: string; readonly p_interested: boolean },
  ): PromiseLike<{
    readonly data: boolean | null;
    readonly error: { readonly message: string } | null;
  }>;
}

export async function setPlayerServiceInterest(
  client: ServiceInterestRpcClient,
  input: { readonly serviceId: string; readonly interested: boolean },
): Promise<boolean> {
  const { data, error } = await client.rpc('set_service_interest', {
    p_service_id: input.serviceId,
    p_interested: input.interested,
  });
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return data === true;
}
