/**
 * The signed-in team member's or entity contact's own account, for the top
 * bar's user menu (RAPP-632) and her account page (RAPP-634): her name, email
 * and profile photo. The name and photo are Basic columns of her own profile
 * row, which the row policy lets her read and update
 * (`profiles_update_self_no_escalation`); the profile guard refuses a blank
 * name. The photo is an object key in the media worker's `profile-photos`
 * folder (RAPP-633). The email lives only in Supabase Auth: no table keeps a
 * copy, so a change there needs no sync.
 *
 * Every `useOwnAccount` reads the row again when any of them saves, so the top
 * bar follows the account page at once.
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

/** The longest name the profile accepts (the onboarding's limit). */
export const OWN_NAME_MAX_LENGTH = 100;

/** Sets her own first and last name (RAPP-634), trimmed. Neither may be blank. */
export async function setOwnName(
  userId: string,
  firstName: string,
  lastName: string,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ first_name: firstName.trim(), last_name: lastName.trim() })
    .eq('id', userId);
  if (error) throw new AppError('DB-1', { message: error.message });
}

export type EmailChangeOutcome = 'sent' | 'taken' | 'invalid' | 'rate-limited' | 'failed';

/** Supabase Auth error codes (https://supabase.com/docs/guides/auth/debugging/error-codes). */
function emailChangeOutcomeFor(code: string | undefined): EmailChangeOutcome {
  if (code === 'email_exists' || code === 'user_already_exists') return 'taken';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'invalid';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return 'rate-limited';
  }
  return 'failed';
}

/**
 * Asks Supabase Auth to move her sign-in to a new email (RAPP-634). Nothing
 * changes until she confirms from the email Supabase sends; with secure email
 * change on, both the old and the new address get a link and both must be
 * opened. The link brings her back to the account page.
 */
export async function requestOwnEmailChange(email: string): Promise<EmailChangeOutcome> {
  const redirectTo =
    typeof window === 'undefined' ? undefined : `${window.location.origin}/account`;
  const { error } = await supabase.auth.updateUser(
    { email: email.trim() },
    redirectTo === undefined ? undefined : { emailRedirectTo: redirectTo },
  );
  return error === null ? 'sent' : emailChangeOutcomeFor(error.code);
}

export interface OwnEmailState {
  /** Her current sign-in email, read from the server. */
  readonly email: string;
  /** The address waiting for her confirmation, or null. */
  readonly pendingEmail: string | null;
}

/**
 * Her email as the server has it now, with any change still waiting for
 * confirmation. When the change went through since the session was issued,
 * the session is refreshed so the top bar shows the new address.
 */
export async function fetchOwnEmailState(sessionEmail: string): Promise<OwnEmailState> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new AppError('AUTH-2', { message: error.message });
  const email = data.user.email ?? sessionEmail;
  if (email !== sessionEmail) await supabase.auth.refreshSession();
  const pending = data.user.new_email;
  return {
    email,
    pendingEmail: typeof pending === 'string' && pending.length > 0 ? pending : null,
  };
}

const OWN_ACCOUNT_CHANGED = 'ramassa:own-account-changed';

/** Tells every mounted `useOwnAccount` to read her row again. */
export function announceOwnAccountChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OWN_ACCOUNT_CHANGED));
}

export interface OwnAccountState {
  readonly account: OwnAccount | null;
  /** Reads the row again in every place that shows it, after a change. */
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

  useEffect(() => {
    const onChanged = () => setVersion((current) => current + 1);
    window.addEventListener(OWN_ACCOUNT_CHANGED, onChanged);
    return () => window.removeEventListener(OWN_ACCOUNT_CHANGED, onChanged);
  }, []);

  const reload = useCallback(() => announceOwnAccountChanged(), []);

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
