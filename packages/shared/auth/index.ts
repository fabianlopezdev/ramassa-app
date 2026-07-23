/**
 * `@ramassa/shared/auth` — the auth surface both apps consume (RAPP-13):
 * the AuthProvider/useAuth state, the actions screens call through their wired
 * `safeAsync`, the Supabase-error → `AUTH-*` mapper, and the origin-validating
 * callback-URL parser.
 */

export { AuthProvider, useAuth, type AuthProviderProps, type AuthState } from './auth-context';
export {
  completeAuthCallback,
  fetchProfileRole,
  requestMagicLink,
  signInWithPassword,
  signOut,
  type PasswordLoginParams,
  type RequestMagicLinkParams,
} from './auth-actions';
export { mapSupabaseAuthError, type SupabaseAuthErrorShape } from './auth-error';
export {
  parseAuthCallbackUrl,
  type AuthCallbackTokens,
  type ParseAuthCallbackUrlOptions,
} from './callback-url';
