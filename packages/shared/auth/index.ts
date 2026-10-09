/**
 * `@ramassa/shared/auth`: the auth surface both apps consume (RAPP-13):
 * the AuthProvider/useAuth state, the actions screens call through their wired
 * `safeAsync`, the Supabase-error → `AUTH-*` mapper, and the access-code helpers.
 */

export { AuthProvider, useAuth, type AuthProviderProps, type AuthState } from './auth-context';
export {
  fetchProfileRole,
  fetchProfileSummary,
  type ProfileSummary,
  requestEmailOtp,
  signInWithPassword,
  signOut,
  verifyEmailOtp,
  type PasswordLoginParams,
  type RequestEmailOtpParams,
  type VerifyEmailOtpParams,
} from './auth-actions';
export {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_CANONICAL_LENGTH,
  ACCESS_CODE_GROUP_COUNT,
  ACCESS_CODE_GROUP_LENGTH,
  ACCESS_CODE_INTERNAL_DOMAIN,
  ACCESS_CODE_PATTERN,
  ACCESS_CODE_RAW_LENGTH,
  canonicalizeAccessCode,
  internalEmailForAccessCode,
  isAccessCode,
  splitAccessCode,
  type AccessCodeParts,
} from './access-code';
export { mapSupabaseAuthError, type SupabaseAuthErrorShape } from './auth-error';
