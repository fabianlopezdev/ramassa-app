/**
 * Item types management (RAPP-253): the material catalog that holders of
 * `equipment.items` keep. A custom item has a name in Catalan and, when
 * given, the other four languages; the app falls back to Catalan.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, databaseErrorCode } from '../errors';
import { resolveLocalizedText, type SupportedLanguage } from '../i18n';
import type { Database } from '../types/database';
import type { HandoverItemType } from './handover';

type Client = SupabaseClient<Database>;

export const ITEM_NAME_LANGUAGES = ['ca', 'es', 'en', 'ar', 'fa'] as const;
export type ItemNameLanguage = (typeof ITEM_NAME_LANGUAGES)[number];
export type ItemName = Readonly<Partial<Record<ItemNameLanguage, string>>>;

export interface ItemTypeInput {
  /** Null creates a custom item. */
  readonly id: string | null;
  readonly name: ItemName;
  readonly kind: 'player_kit' | 'team_equipment';
  readonly sizes: readonly string[];
  readonly defaultValueCents: number | null;
  readonly codePrefix: string;
  readonly isActive: boolean;
}

/**
 * What a person reads for an item: a custom item's own name in her language
 * (Catalan when missing), or the app's translation of a built-in key.
 */
export function itemTypeLabel(
  type: Pick<HandoverItemType, 'key' | 'name' | 'is_builtin'> | undefined,
  key: string,
  language: SupportedLanguage,
  translate: (key: string) => string,
): string {
  if (type !== undefined && !type.is_builtin && type.name !== null) {
    return resolveLocalizedText(type.name, language)?.text ?? key;
  }
  return translate(key);
}

export async function saveItemType(client: Client, input: ItemTypeInput): Promise<string> {
  const { data, error } = await client.rpc('save_item_type', {
    // A new item sends null; the generated type cannot say so.
    p_id: input.id as string,
    p_name: input.name,
    p_kind: input.kind,
    p_sizes: [...input.sizes],
    p_default_value_cents: input.defaultValueCents as number,
    p_code_prefix: input.codePrefix,
    p_is_active: input.isActive,
  });
  if (error) {
    throw new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
  }
  return data;
}

/** Sizes typed as "S, M, L" or one per add: trimmed, no blanks, no repeats, in order. */
export function cleanSizes(sizes: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const size of sizes) {
    const trimmed = size.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
