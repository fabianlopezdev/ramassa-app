/**
 * `@ramassa/shared/auth` — the auth surface both apps consume (RAPP-13):
 * the AuthProvider/useAuth state, the actions screens call through their wired
 * `safeAsync`, the Supabase-error → `AUTH-*` mapper, and the origin-validating
 * email-code verification.
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
export { mapSupabaseAuthError, type SupabaseAuthErrorShape } from './auth-error';
