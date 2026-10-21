/**
 * `@ramassa/shared/auth`: the auth surface both apps consume (RAPP-13):
 * the AuthProvider/useAuth state, the actions screens call through their wired
 * `safeAsync`, and the Supabase-error → `AUTH-*` mapper.
 */

export { AuthProvider, useAuth, type AuthProviderProps, type AuthState } from './auth-context';
export {
  fetchProfileRole,
  fetchProfileSummary,
  type ProfileSummary,
  requestEmailOtp,
  signInWithPassword,
  signOut,
  verifyEmailCode,
  verifyEmailOtp,
  type PasswordLoginParams,
  type RequestEmailOtpParams,
  type VerifyEmailOtpParams,
} from './auth-actions';
export { mapSupabaseAuthError, type SupabaseAuthErrorShape } from './auth-error';
export {
  assuranceLevelOf,
  needsSecondFactor,
  resetSecondFactor,
  startSecondFactor,
  verifySecondFactor,
  type SecondFactorStart,
} from './second-factor';
export { isSamePermissionSet, subscribeToOwnPermissionChanges } from './permission-changes';
export { isSessionCurrent, signOutEverywhere } from './sessions';
export {
  originOf,
  PLAYER_PREVIEW_HANDOFF,
  PLAYER_PREVIEW_HANDOFF_PATH,
  PLAYER_PREVIEW_READY,
  playerPreviewHandoffSchema,
  startPlayerPreview,
  type PlayerPreviewCredentials,
  type PlayerPreviewHandoff,
} from './player-preview';
export { confirmSecondFactor, hasRecentSecondFactor, secondFactorVerifiedAt } from './step-up';
