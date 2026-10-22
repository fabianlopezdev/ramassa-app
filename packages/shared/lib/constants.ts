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

// The app terms version is data since RAPP-613 (`app_terms_versions`): staff
// publish new versions in the admin, and the phone reads the current one from
// the onboarding catalog. The bundled text is version 1.

/**
 * Optional monitored mailbox shown before authentication. It stays hidden
 * until Ramassa confirms the address and the deployment config supplies it.
 */
const configuredSupportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
export const SUPPORT_EMAIL = configuredSupportEmail || null;

/**
 * How old the last authenticator code may be for a risky action (RAPP-235):
 * RGPD deletion, permission and preset changes, new accounts, second-factor
 * resets and exports. The database migration `step_up_checks` uses the same
 * 10 minutes, and the media Worker checks it before an erasure sweep.
 */
export const STEP_UP_WINDOW_SECONDS = 10 * 60;
