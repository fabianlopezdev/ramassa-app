/**
 * Hiding a screen (RAPP-711): Onboarding's screens, the app's and the team's,
 * and the screens of the forms the team created. Her phone skips a hidden
 * screen, and the screen counts leave it out.
 *
 * One rule, the database's (`private.screen_must_show`): a screen can be
 * hidden only while it asks nothing required and holds no signature block.
 * While it is hidden, nothing required goes on it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, databaseErrorCode } from '../errors';
import type { Database } from '../types/database';
import type { IntakeCatalog } from './builder';
import { consentsOn } from './consents';
import { formBlocksOn } from './form-blocks';
import { placementsOnSurface } from './profile-layout';

type Client = SupabaseClient<Database>;

/** Why a screen always shows: a required field or consent, or a signature block. */
export type ScreenHideLock = 'required' | 'signature';

/** What keeps a screen shown, or null when it can be hidden. */
export function screenHideLock(
  catalog: IntakeCatalog,
  surface: 'onboarding' | 'custom_form',
  screenKey: string,
): ScreenHideLock | null {
  if (formBlocksOn(catalog.blocks, surface, screenKey).length > 0) return 'signature';
  const requiredField =
    catalog.layout !== undefined &&
    placementsOnSurface(catalog.layout, surface, screenKey).some((placement) => placement.required);
  const requiredConsent = consentsOn(catalog, surface, screenKey).some(
    (consent) => consent.required,
  );
  return requiredField || requiredConsent ? 'required' : null;
}

/** Hides or shows a screen the team made, at once; the database checks the rule. */
export async function setScreenHidden(
  client: Client,
  screenId: string,
  isHidden: boolean,
): Promise<void> {
  const { error } = await client.rpc('set_screen_hidden', {
    p_screen_id: screenId,
    p_hidden: isHidden,
  });
  if (error)
    throw new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}
