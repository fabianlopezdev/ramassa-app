/**
 * Auth schemas (RAPP-13): the single validation source for both login forms
 * (client validates for UX, server/Supabase re-validates for security) and for
 * the profile role claim read back from the database.
 *
 * ADR-005: magic link is primary (email only); the admin-created fallback adds
 * a password. Both apps import these; neither redefines them.
 */

import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../lib/constants';

/**
 * A login email: trimmed and lowercased BEFORE the format check, so
 * "  Marc@Ramassa.CAT " validates and normalizes to "marc@ramassa.cat".
 * Supabase treats addresses case-insensitively, so normalizing here keeps the
 * client, the server, and the stored identity in agreement.
 */
export const loginEmailSchema = z.string().trim().toLowerCase().pipe(z.email());

/** A fallback-account password (ADR-005). Length only; Supabase owns hashing. */
export const loginPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH);

/** Magic-link request: email is all a player needs to type (the common path). */
export const magicLinkRequestSchema = z.object({
  email: loginEmailSchema,
});
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

/** Password login: the admin-created fallback for players without an email. */
export const passwordLoginSchema = z.object({
  email: loginEmailSchema,
  password: loginPasswordSchema,
});
export type PasswordLogin = z.infer<typeof passwordLoginSchema>;

/**
 * The four roles a signed-in identity can carry (SPEC user roles). Stored in
 * `profiles.role` (a text column) and read back through this schema so an
 * unexpected value fails loudly instead of silently unlocking the wrong UI.
 */
export const appRoleSchema = z.enum(['player', 'staff', 'admin', 'entity']);
export type AppRole = z.infer<typeof appRoleSchema>;
