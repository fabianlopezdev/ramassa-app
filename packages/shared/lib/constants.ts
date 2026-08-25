/**
 * Named domain constants (SPEC: "no magic numbers"). Numeric thresholds and
 * limits that are NOT design tokens (sizes, colors, spacing live in
 * `tokens/`) live here so a reader meets a name, never a bare number.
 *
 * Feature issues append their own constants as they arrive.
 */

/**
 * Minimum length for an admin-created fallback password (ADR-005). Kept modest
 * because staff create and hand these to players in person; it guards typos,
 * not remote brute force (rate limiting and Supabase Auth own that).
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * The terms-of-use version the wizard shows and records (RAPP-21). Bump it
 * when the text changes; every acceptance stores the version it was shown, so
 * a bump makes re-acceptance detectable without touching old records. Mirrors
 * the seeded acceptances (SEED_TERMS_VERSION in testing/).
 */
export const CURRENT_TERMS_VERSION = '2026-07-01';

/**
 * Optional monitored mailbox shown before authentication. It stays hidden
 * until Ramassa confirms the address and the deployment config supplies it.
 */
const configuredSupportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
export const SUPPORT_EMAIL = configuredSupportEmail || null;
