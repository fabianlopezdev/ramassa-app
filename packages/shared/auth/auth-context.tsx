/**
 * The shared auth state both apps mount at their root (RAPP-13, issue scope §4).
 * It owns exactly one thing: the current session and the role claim derived
 * from it. supabase-js already persists and refreshes the session in the
 * injected storage (MMKV / localStorage), so this provider does not store
 * anything itself — it subscribes to `onAuthStateChange`, mirrors the session
 * into React state, and looks up the profile role whenever the session changes.
 *
 * Actions (request magic link, password sign-in, sign out) are NOT on this
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
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppError, type AppError as AppErrorType } from '../errors';
import type { AppRole } from '../schemas/auth';
import type { Database } from '../types/database';
import { fetchProfileSummary } from './auth-actions';

type Client = SupabaseClient<Database>;

export interface AuthState {
  readonly session: Session | null;
  readonly user: User | null;
  readonly role: AppRole | null;
  /** True until the first session (and, if present, its role) has resolved. */
  readonly isLoading: boolean;
  /**
   * True when the signed-in identity has no completed onboarding: either no
   * profile row yet (every brand-new player) or a profile whose terms were
   * never accepted (staff-created edge cases). The (app) layout routes on it.
   * Deliberately FALSE when the profile lookup failed: "we could not read the
   * profile" is not evidence there is no profile, and mis-routing an onboarded
   * player into the wizard is worse than showing an error.
   */
  readonly needsOnboarding: boolean;
  /** Re-reads the profile for the current session; the wizard calls it after `complete_onboarding` so the gate flips without a sign-out round trip. */
  readonly refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export interface AuthProviderProps {
  readonly client: Client;
  readonly children: ReactNode;
  /** Reports a role-lookup failure to the app's wired logger/Sentry. */
  readonly onError?: (error: AppErrorType) => void;
}

export function AuthProvider({ client, children, onError }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Kept in a ref so the subscription effect depends only on `client`; an
  // inline `onError` from the app must not tear down and rebuild the listener.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // A monotonic token so a slow role lookup from an old session can never
  // overwrite the state of a newer one (sign in, then sign out quickly).
  const latestChangeRef = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const applySessionRef = useRef<((next: Session | null) => Promise<void>) | null>(null);

  useEffect(() => {
    let isSubscribed = true;

    async function applySession(nextSession: Session | null): Promise<void> {
      const changeId = latestChangeRef.current + 1;
      latestChangeRef.current = changeId;
      if (isSubscribed) {
        setSession(nextSession);
        sessionRef.current = nextSession;
      }

      if (!nextSession) {
        if (isSubscribed && latestChangeRef.current === changeId) {
          setRole(null);
          setNeedsOnboarding(false);
          setIsLoading(false);
        }
        return;
      }

      try {
        const summary = await fetchProfileSummary(client, nextSession.user.id);
        if (isSubscribed && latestChangeRef.current === changeId) {
          setRole(summary?.role ?? null);
          setNeedsOnboarding(summary === null || summary.termsAcceptedAt === null);
        }
      } catch (error) {
        if (isSubscribed && latestChangeRef.current === changeId) {
          setRole(null);
          setNeedsOnboarding(false);
        }
        onErrorRef.current?.(error as AppErrorType);
      } finally {
        if (isSubscribed && latestChangeRef.current === changeId) {
          setIsLoading(false);
        }
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

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      isLoading,
      needsOnboarding,
      refreshProfile,
    }),
    [session, role, isLoading, needsOnboarding, refreshProfile],
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
