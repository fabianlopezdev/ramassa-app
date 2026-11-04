/**
 * Collecting the authorization on a staff tablet (RAPP-305), phone side: the
 * signing session, the version she signs, and the outbox her signing waits in.
 *
 * Everything here lives in `privateStorage`. A signing goes into the outbox
 * first and out at once when the tablet is online, so signing mode behaves the
 * same with or without signal.
 */
import { useQuery } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchAuthorizationForSigning,
  sendTabletSigning,
  type AuthorizationForSigning,
  type TabletSigner,
  type TabletSigning,
} from '@ramassa/shared/authorization';
import { AppError } from '@ramassa/shared/errors';
import {
  EMPTY_INTAKE_CATALOG,
  fetchIntakeCatalog,
  parseCatalogWithFormVersion,
  type IntakeCatalog,
  liveOnboardingBlocks,
  liveOnboardingConsents,
  type PlacedConsent,
  type SignatureFormBlock,
} from '@ramassa/shared/intake-builder';
import { isNetworkStateOnline } from './network-status';
import { finishesWithin, SCREEN_SEND_WAIT_MS } from './outbox-drain-loop';
import {
  endSigningSession,
  readAuthorizationForSigning,
  readSigningSession,
  saveAuthorizationForSigning,
  startSigningSession,
} from './signing-mode';
import {
  createSigningOutbox,
  pendingSigningCount,
  type SigningOutboxEntry,
} from './signing-outbox';
import { privateStorage } from './storage';
import { supabase } from './supabase';

const NO_ENTRIES: readonly SigningOutboxEntry[] = [];

// The outbox and the session live in storage, outside React. Every change bumps
// this version, so the screens and the app lock read them again.
let version = 0;
const listeners = new Set<() => void>();
function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const readVersion = () => version;

function useStorageVersion(): number {
  return useSyncExternalStore(subscribe, readVersion, readVersion);
}

/** Sends what waits for this coach. Each confirmed signing leaves the tablet. */
export async function drainSignings(
  userId: string,
): Promise<{ readonly sent: number; readonly nextRetryAt: string | null }> {
  const result = await createSigningOutbox(privateStorage, userId).drain((entry) =>
    sendTabletSigning(supabase, entry),
  );
  changed();
  return { sent: result.sent, nextRetryAt: result.nextRetryAt };
}

/** How many signings wait on this tablet for the signed-in coach. */
export function usePendingSigningCount(): number {
  const { user } = useAuth();
  const current = useStorageVersion();
  return useMemo(
    () => (current >= 0 && user !== null ? pendingSigningCount(privateStorage, user.id) : 0),
    [current, user],
  );
}

/** For a sign-out button outside React state: the count right now. */
export function pendingSigningCountNow(userId: string | null): number {
  return userId === null ? 0 : pendingSigningCount(privateStorage, userId);
}

/** The signings waiting on this tablet, and the coach's retry and discard. */
export function useSigningOutbox() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isOnline = isNetworkStateOnline(useNetworkState());
  const current = useStorageVersion();
  const outbox = useMemo(
    () => (userId === null ? null : createSigningOutbox(privateStorage, userId)),
    [userId],
  );
  const entries = useMemo(
    () => (current >= 0 && outbox !== null ? outbox.list() : NO_ENTRIES),
    [outbox, current],
  );

  const record = useCallback(
    async (signing: TabletSigning): Promise<'saved' | 'waiting'> => {
      if (outbox === null || userId === null) throw new AppError('AUTH-3');
      outbox.enqueue(signing);
      changed();
      if (!isOnline) return 'waiting';
      // A server that never answers must not hold her on the form (RAPP-530):
      // after a short wait she is told it is saved on the tablet, and it syncs.
      await finishesWithin(drainSignings(userId), SCREEN_SEND_WAIT_MS);
      return outbox.list().some((entry) => entry.id === signing.id) ? 'waiting' : 'saved';
    },
    [isOnline, outbox, userId],
  );
  const retry = useCallback(
    (id: string) => {
      if (outbox === null || userId === null) return;
      outbox.retry(id);
      changed();
      if (isOnline) void drainSignings(userId);
    },
    [isOnline, outbox, userId],
  );
  return { entries, record, retry };
}

/** The open signing session, and the way to open and close it. */
export function useSigningSession() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const current = useStorageVersion();
  const session = useMemo(
    () => (current >= 0 ? readSigningSession(privateStorage, userId) : null),
    [current, userId],
  );
  const start = useCallback(
    (signer: TabletSigner) => {
      if (userId === null) return;
      startSigningSession(privateStorage, userId, signer);
      changed();
    },
    [userId],
  );
  /** Call only after the coach's biometrics or passcode. */
  const end = useCallback(() => {
    endSigningSession(privateStorage);
    changed();
  }, []);
  return { session, start, end };
}

/**
 * The version she signs. Read online and kept on the tablet, so signing mode
 * opens with no connection; with neither, there is nothing to sign.
 */
export function useAuthorizationForSigning(enabled: boolean) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ['authorization-for-signing', userId ?? 'signed-out'],
    queryFn: async () => {
      if (userId === null) return null;
      try {
        const fresh = await fetchAuthorizationForSigning(supabase);
        saveAuthorizationForSigning(privateStorage, userId, fresh);
        return fresh;
      } catch (error) {
        const kept = readAuthorizationForSigning(privateStorage, userId);
        if (kept !== null) return kept;
        throw error;
      }
    },
    initialData: () =>
      userId === null
        ? undefined
        : (readAuthorizationForSigning(privateStorage, userId) ?? undefined),
    initialDataUpdatedAt: 0,
    enabled: enabled && userId !== null,
    retry: false,
  });
}

const signingCatalogKey = (userId: string) => `ramassa.signing-catalog.v1:${userId}`;

/**
 * Her catalog for the version the tablet collects (RAPP-773): the
 * authorization form as that version froze it, with the fields, consents and
 * blocks it asks. Read online and kept on the tablet, like the version, so
 * signing mode opens with no connection.
 */
export function useSigningCatalog(version: AuthorizationForSigning | null | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ['signing-catalog', userId ?? 'signed-out', version?.versionId ?? 'none'],
    queryFn: async (): Promise<IntakeCatalog> => {
      if (userId === null || version == null) return EMPTY_INTAKE_CATALOG;
      let raw: unknown;
      try {
        const { data, error } = await supabase.rpc('intake_catalog');
        if (error) throw new Error(error.message);
        raw = data;
        privateStorage.set(signingCatalogKey(userId), JSON.stringify(data));
      } catch (error) {
        const kept = privateStorage.getString(signingCatalogKey(userId));
        if (kept === undefined) throw error;
        raw = JSON.parse(kept) as unknown;
      }
      return parseCatalogWithFormVersion(raw, version);
    },
    enabled: userId !== null && version != null,
    retry: false,
  });
}

/**
 * What a walk-in answers of her Onboarding on the tablet after the
 * authorization: the signature blocks of the live screens (RAPP-691) and the
 * consents placed on them (RAPP-699). Read online; with no connection there
 * are none, and she answers them on her own phone later.
 */
export function useWalkInOnboardingAsks(enabled: boolean) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ['walk-in-onboarding-asks', userId ?? 'signed-out'],
    queryFn: async (): Promise<{
      readonly blocks: readonly SignatureFormBlock[];
      readonly consents: readonly PlacedConsent[];
    }> => {
      try {
        const catalog = await fetchIntakeCatalog(supabase);
        return { blocks: liveOnboardingBlocks(catalog), consents: liveOnboardingConsents(catalog) };
      } catch {
        return { blocks: [], consents: [] };
      }
    },
    enabled: enabled && userId !== null,
    retry: false,
  });
}
