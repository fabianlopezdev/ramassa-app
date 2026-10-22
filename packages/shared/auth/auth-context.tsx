/**
 * The shared auth state both apps mount at their root (RAPP-13, issue scope §4).
 * It owns the current session, the role claim derived from it, and, for a
 * team member, her permissions (RAPP-231), which menus and route guards read. supabase-js already persists and refreshes the session in the
 * injected storage (MMKV / localStorage), so this provider does not store
 * anything itself. It subscribes to `onAuthStateChange`, mirrors the session
 * into React state, and looks up the profile role whenever the session changes.
 *
 * Actions (request and verify an email code, sign out) are NOT on this
 * context: screens call the `auth-actions` functions through their app's wired
 * `safeAsync`, and the resulting session change flows back in through the
 * subscription here. That keeps logging/Sentry in the app layer and this
 * provider dependency-light.
 */

import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppError, type AppError as AppErrorType } from '../errors';
import { fetchTermsAcceptanceNeeded } from '../onboarding/app-terms';
import { fetchMyPermissions, type PermissionCode } from '../permissions';
import type { AppRole } from '../schemas/auth';
import type { Database } from '../types/database';
import { fetchProfileSummary } from './auth-actions';
import { isSamePermissionSet, subscribeToOwnPermissionChanges } from './permission-changes';
import {
  assuranceLevelOf,
  fetchSecondFactorWaived,
  mayHaveSecondFactorWaived,
  sessionIdOf,
  needsSecondFactor as sessionNeedsSecondFactor,
} from './second-factor';
import { isSessionCurrent } from './sessions';

type Client = SupabaseClient<Database>;

export interface AuthState {
  readonly session: Session | null;
  readonly user: User | null;
  readonly role: AppRole | null;
  /**
   * The signed-in team member's permissions (RAPP-231). Empty for players,
   * entity contacts and signed-out visitors. A UX input only: the database
   * checks every permission again.
   */
  readonly permissions: ReadonlySet<PermissionCode>;
  /** True until the first session (and, if present, its role) has resolved. */
  readonly isLoading: boolean;
  /**
   * True while a profile lookup for the current session is in flight (RAPP-232),
   * for instance just after signing in. The previous role stays in place during
   * a refresh, so this matters only while `role` is still null: the app waits
   * instead of treating "not known yet" as "unknown".
   */
  readonly isResolvingProfile: boolean;
  /**
   * True for a team member or entity contact whose session is not yet verified
   * with her authenticator (RAPP-233). Her access rules reach nothing until it
   * is, so both apps show the second-factor step first.
   */
  readonly needsSecondFactor: boolean;
  /**
   * True for a test account's session on staging, where the second factor is
   * switched off for test accounts (RAPP-628): she reaches her data at aal1 and
   * never sees the authenticator step. Always false on production, for real
   * accounts, for players and for sessions already at aal2.
   */
  readonly secondFactorWaived: boolean;
  /**
   * False just after the second factor verifies, until the permissions are read
   * again at the new assurance level (RAPP-233). Screens that route by
   * permission wait for it, so they never route on the empty list from before.
   */
  readonly permissionsAreCurrent: boolean;
  /**
   * True when the signed-in identity has no completed onboarding: either no
   * profile row yet (every brand-new player) or a profile whose terms were
   * never accepted (staff-created edge cases). The (app) layout routes on it.
   * Deliberately FALSE when the profile lookup failed: "we could not read the
   * profile" is not evidence there is no profile, and mis-routing an onboarded
   * player into the wizard is worse than showing an error.
   */
  readonly needsOnboarding: boolean;
  /**
   * True for a player who joined but has not accepted the current app terms
   * version (RAPP-613): her app shows the terms screen alone until she does.
   * False when the lookup fails, as for `needsOnboarding`: a network flake
   * must never lock her out.
   */
  readonly needsTermsAcceptance: boolean;
  /** Re-reads the profile and permissions for the current session; the wizard calls it after `complete_onboarding` so the gate flips without a sign-out round trip, and the Team screen after changing the caller's own toggles. */
  readonly refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const NO_PERMISSIONS: ReadonlySet<PermissionCode> = new Set();

export interface AuthProviderProps {
  readonly client: Client;
  readonly children: ReactNode;
  /** Reports a role-lookup failure to the app's wired logger/Sentry. */
  readonly onError?: (error: AppErrorType) => void;
}

export function AuthProvider({ client, children, onError }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<ReadonlySet<PermissionCode>>(NO_PERMISSIONS);
  const [permissionsLevel, setPermissionsLevel] = useState<'aal1' | 'aal2' | null>(null);
  const [secondFactorWaived, setSecondFactorWaived] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [needsTermsAcceptance, setNeedsTermsAcceptance] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolvingProfile, setIsResolvingProfile] = useState(false);

  // Kept in a ref so the subscription effect depends only on `client`; an
  // inline `onError` from the app must not tear down and rebuild the listener.
  // Synced after commit (render must stay pure); every report is asynchronous,
  // so it always reads the committed callback.
  const onErrorRef = useRef(onError);
  useLayoutEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // A monotonic token so a slow role lookup from an old session can never
  // overwrite the state of a newer one (sign in, then sign out quickly).
  const latestChangeRef = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  // The waiver is asked once per session (RAPP-628): a token refresh or a
  // profile refresh keeps the same answer. A failed lookup is not kept.
  const waiverRef = useRef<{ readonly key: string; readonly waived: boolean } | null>(null);
  const applySessionRef = useRef<((next: Session | null) => Promise<void>) | null>(null);

  useEffect(() => {
    let isSubscribed = true;

    async function applySession(nextSession: Session | null): Promise<void> {
      const changeId = latestChangeRef.current + 1;
      latestChangeRef.current = changeId;
      if (isSubscribed) {
        setSession(nextSession);
        sessionRef.current = nextSession;
        setIsResolvingProfile(nextSession !== null);
      }

      if (!nextSession) {
        if (isSubscribed && latestChangeRef.current === changeId) {
          setRole(null);
          setPermissions(NO_PERMISSIONS);
          setSecondFactorWaived(false);
          setNeedsOnboarding(false);
          setNeedsTermsAcceptance(false);
          setIsLoading(false);
        }
        waiverRef.current = null;
        return;
      }

      try {
        // A session ended remotely is signed out here too (RAPP-234); the
        // sign-out event then runs this again with no session.
        if (!(await isSessionCurrent(client))) {
          await client.auth.signOut({ scope: 'local' });
          return;
        }
        const summary = await fetchProfileSummary(client, nextSession.user.id);
        const isTeamMember = summary?.role === 'staff' || summary?.role === 'admin';
        const [nextPermissions, waived] = await Promise.all([
          isTeamMember ? fetchMyPermissions(client) : NO_PERMISSIONS,
          readSecondFactorWaiver(summary?.role ?? null, nextSession),
        ]);
        const joinedPlayer = summary?.role === 'player' && summary.termsAcceptedAt !== null;
        const termsNeeded = joinedPlayer
          ? await fetchTermsAcceptanceNeeded(client).catch(() => false)
          : false;
        if (isSubscribed && latestChangeRef.current === changeId) {
          setRole(summary?.role ?? null);
          // The same set object while nothing changed, so a screen can tell a
          // real permission change from a refresh (RAPP-237).
          setPermissions((current) =>
            isSamePermissionSet(current, nextPermissions) ? current : nextPermissions,
          );
          setPermissionsLevel(assuranceLevelOf(nextSession));
          setSecondFactorWaived(waived);
          setNeedsOnboarding(summary === null || summary.termsAcceptedAt === null);
          setNeedsTermsAcceptance(termsNeeded);
        }
      } catch (error) {
        if (isSubscribed && latestChangeRef.current === changeId) {
          setRole(null);
          setPermissions(NO_PERMISSIONS);
          setSecondFactorWaived(false);
          setNeedsOnboarding(false);
          setNeedsTermsAcceptance(false);
        }
        onErrorRef.current?.(error as AppErrorType);
      } finally {
        if (isSubscribed && latestChangeRef.current === changeId) {
          setIsLoading(false);
          setIsResolvingProfile(false);
        }
      }
    }

    // Only a team member or entity contact below aal2 asks (RAPP-628); a
    // player costs no round trip. A failed lookup keeps the second factor.
    async function readSecondFactorWaiver(
      nextRole: AppRole | null,
      nextSession: Session,
    ): Promise<boolean> {
      if (!mayHaveSecondFactorWaived(nextRole, nextSession)) return false;
      const key = `${nextSession.user.id}:${sessionIdOf(nextSession) ?? ''}`;
      if (waiverRef.current?.key === key) return waiverRef.current.waived;
      try {
        const waived = await fetchSecondFactorWaived(client);
        waiverRef.current = { key, waived };
        return waived;
      } catch {
        return false;
      }
    }

    applySessionRef.current = applySession;

    void client.auth.getSession().then(({ data }) => applySession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    return () => {
      isSubscribed = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  // Re-runs the whole applySession pipeline for the current session, so
  // refresh shares the race guard and the error path with the subscription
  // instead of maintaining a second, subtly different copy.
  const refreshProfile = useCallback(async () => {
    await applySessionRef.current?.(sessionRef.current);
  }, []);

  // A team member's permissions reload the moment someone changes them, so
  // menus and screens follow without a sign-out (RAPP-237).
  const userId = session?.user.id ?? null;
  const isTeamMember = role === 'staff' || role === 'admin';
  useEffect(() => {
    if (userId === null || !isTeamMember) return;
    return subscribeToOwnPermissionChanges(client, userId, () => void refreshProfile());
  }, [client, userId, isTeamMember, refreshProfile]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      permissions,
      isLoading,
      isResolvingProfile,
      needsSecondFactor: sessionNeedsSecondFactor(role, session, secondFactorWaived),
      secondFactorWaived,
      permissionsAreCurrent:
        session === null ||
        (role !== 'staff' && role !== 'admin') ||
        permissionsLevel === assuranceLevelOf(session),
      needsOnboarding,
      needsTermsAcceptance,
      refreshProfile,
    }),
    [
      session,
      role,
      permissions,
      permissionsLevel,
      secondFactorWaived,
      isLoading,
      isResolvingProfile,
      needsOnboarding,
      needsTermsAcceptance,
      refreshProfile,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const value = use(AuthContext);
  if (!value) {
    throw new AppError('UNEXPECTED-1', {
      message: 'useAuth must be used within an <AuthProvider>',
    });
  }
  return value;
}
