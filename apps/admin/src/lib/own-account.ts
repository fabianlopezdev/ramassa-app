/**
 * The signed-in team member's or entity contact's own account, for the top
 * bar's user menu (RAPP-632): her name, email and profile photo. The name and
 * photo are Basic columns of her own profile row, which the row policy lets
 * her read and update (`profiles_update_self_no_escalation`); the photo is an
 * object key in the media worker's `profile-photos` folder (RAPP-633).
 */
import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';

const ownAccountRowSchema = z.object({
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

export interface OwnAccount {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  /** The `profile-photos` object key, or null when she has no photo. */
  readonly avatarUrl: string | null;
}

export { accountDisplayName, accountInitials } from '@/lib/initials';

export async function fetchOwnAccountRow(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('first_name, last_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new AppError('DB-1', { message: error.message });
  return data === null ? null : ownAccountRowSchema.parse(data);
}

/**
 * Sets or clears her own profile photo (RAPP-633). A direct write to her own
 * row: the row policy allows it and the profile guard leaves `avatar_url` open,
 * exactly as a participant's own photo is.
 */
export async function setOwnAvatar(userId: string, avatarUrl: string | null): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId);
  if (error) throw new AppError('DB-1', { message: error.message });
}

export interface OwnAccountState {
  readonly account: OwnAccount | null;
  /** Reads the row again, after a photo change. */
  readonly reload: () => void;
}

export function useOwnAccount(): OwnAccountState {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? '';
  const [row, setRow] = useState<z.infer<typeof ownAccountRowSchema> | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (userId === null) {
      setRow(null);
      return undefined;
    }
    let active = true;
    void fetchOwnAccountRow(userId)
      .then((next) => {
        if (active) setRow(next);
      })
      .catch(() => {
        // The menu still works from the session alone: email, initials, sign out.
        if (active) setRow(null);
      });
    return () => {
      active = false;
    };
  }, [userId, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  const account: OwnAccount | null =
    userId === null
      ? null
      : {
          firstName: row?.first_name ?? '',
          lastName: row?.last_name ?? '',
          email,
          avatarUrl: row?.avatar_url ?? null,
        };
  return { account, reload };
}
