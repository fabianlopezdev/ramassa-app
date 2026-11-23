/**
 * One published version of a form, as it was published (RAPP-924): the
 * catalog with that form as the version froze it, so its screens can be shown
 * again. Each kind of form keeps the frozen form in its own ledger:
 *
 *   - a team form in `custom_form_versions.content`, by version number;
 *   - the season authorization in `authorization_versions.form_snapshot`;
 *   - the app terms in `app_terms_versions.form_snapshot`.
 *
 * The last two are read by their row id. A published version is readable by
 * everyone of the organization (their select policies); a draft never is.
 * The tablet shows the version she signs the same way (`parseCatalogWithFormVersion`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors';
import type { Database } from '../types/database';
import { parseCatalogWithFormVersion } from './authorization-form';
import type { IntakeCatalog } from './builder';
import type { CustomForm } from './custom-form-model';

type Client = SupabaseClient<Database>;

export interface PublishedFormVersion {
  readonly number: number;
  /** The season it was published for; null for a form without seasons. */
  readonly seasonName: string | null;
  readonly publishedAt: string;
  /** The catalog with the form as this version froze it; null when no copy was kept. */
  readonly catalog: IntakeCatalog | null;
}

interface VersionRow {
  readonly number: number;
  readonly snapshot: unknown;
  readonly seasonName: string | null;
  readonly publishedAt: string;
}

function failed(message: string): AppError {
  return new AppError('DB-1', { message });
}

async function versionRow(
  client: Client,
  form: Pick<CustomForm, 'id' | 'systemKey'>,
  versionKey: string,
): Promise<VersionRow | null> {
  if (form.systemKey === 'season_authorization') {
    const { data, error } = await client
      .from('authorization_versions')
      .select('version_number, form_snapshot, published_at, seasons(name)')
      .eq('id', versionKey)
      .maybeSingle();
    if (error) throw failed(error.message);
    if (data === null || data.published_at === null || data.version_number === null) return null;
    return {
      number: data.version_number,
      snapshot: data.form_snapshot,
      seasonName: data.seasons?.name ?? null,
      publishedAt: data.published_at,
    };
  }
  if (form.systemKey === 'app_terms') {
    const { data, error } = await client
      .from('app_terms_versions')
      .select('version_number, form_snapshot, published_at')
      .eq('id', versionKey)
      .maybeSingle();
    if (error) throw failed(error.message);
    if (data === null || data.published_at === null || data.version_number === null) return null;
    return {
      number: data.version_number,
      snapshot: data.form_snapshot,
      seasonName: null,
      publishedAt: data.published_at,
    };
  }
  const number = Number(versionKey);
  if (!Number.isInteger(number)) return null;
  const { data, error } = await client
    .from('custom_form_versions')
    .select('version, content, published_at, seasons(name)')
    .eq('form_id', form.id)
    .eq('version', number)
    .maybeSingle();
  if (error) throw failed(error.message);
  if (data === null) return null;
  return {
    number: data.version,
    snapshot: data.content,
    seasonName: data.seasons?.name ?? null,
    publishedAt: data.published_at,
  };
}

/** The version, or null when the form has no such published version. */
export async function fetchPublishedFormVersion(
  client: Client,
  form: Pick<CustomForm, 'id' | 'systemKey'>,
  versionKey: string,
): Promise<PublishedFormVersion | null> {
  const [row, catalog] = await Promise.all([
    versionRow(client, form, versionKey),
    client.rpc('intake_catalog'),
  ]);
  if (catalog.error) throw failed(catalog.error.message);
  if (row === null) return null;
  return {
    number: row.number,
    seasonName: row.seasonName,
    publishedAt: row.publishedAt,
    catalog:
      row.snapshot === null
        ? null
        : parseCatalogWithFormVersion(catalog.data, {
            formId: form.id,
            formSnapshot: row.snapshot,
          }),
  };
}
