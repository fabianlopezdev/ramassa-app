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
