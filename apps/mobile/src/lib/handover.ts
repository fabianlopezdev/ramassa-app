/**
 * Handover with signature and returns (RAPP-249), phone side. A handover goes
 * into the encrypted outbox first and out at once when the phone is online, so
 * the screen behaves the same with or without signal. A return needs a
 * connection: it is recorded from her card, which needs one to load.
 *
 * None of these reads is persisted to disk: their roots are not on the
 * allow-list in query-persistence.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchHandoverItemTypes,
  fetchOpenStockAlerts,
  fetchParticipantMaterial,
  recordEquipmentHandover,
  recordEquipmentReturn,
  type HandoverResult,
  type ReturnCondition,
} from '@ramassa/shared/equipment';
import { AppError } from '@ramassa/shared/errors';
import {
  createHandoverOutbox,
  type EnqueueHandover,
  type HandoverOutboxEntry,
} from './handover-outbox';
import { isNetworkStateOnline } from './network-status';
import { privateStorage } from './storage';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';
const ITEM_TYPES_STALE_MS = 10 * 60_000;
const NO_ENTRIES: readonly HandoverOutboxEntry[] = [];

const participantMaterialRoot = (userId: string) => ['participant-material', userId] as const;
const stockAlertsKey = (userId: string) => ['stock-alerts', userId] as const;

// The outbox lives in storage, outside React. Every change to it bumps this
// version, so screens showing waiting handovers read it again.
let outboxVersion = 0;
const outboxListeners = new Set<() => void>();
function outboxChanged(): void {
  outboxVersion += 1;
  for (const listener of outboxListeners) listener();
}
function subscribeToOutbox(listener: () => void): () => void {
  outboxListeners.add(listener);
  return () => outboxListeners.delete(listener);
}
const readOutboxVersion = () => outboxVersion;

function sendHandoverEntry(entry: HandoverOutboxEntry): Promise<HandoverResult> {
  return recordEquipmentHandover(supabase, entry);
}

/** Sends what waits, then refreshes what the sent handovers changed. */
export async function drainHandovers(
  userId: string,
  queryClient: QueryClient,
): Promise<{ readonly delivered: readonly HandoverResult[]; readonly nextRetryAt: string | null }> {
  const result = await createHandoverOutbox(privateStorage, userId).drain(sendHandoverEntry);
  outboxChanged();
  if (result.sent > 0) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: participantMaterialRoot(userId) }),
      queryClient.invalidateQueries({ queryKey: stockAlertsKey(userId) }),
    ]);
  }
  return { delivered: result.delivered, nextRetryAt: result.nextRetryAt };
}

export const itemTypesKey = (userId: string) => ['equipment-item-types', userId] as const;

export function useHandoverItemTypes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: itemTypesKey(user?.id ?? SIGNED_OUT),
    queryFn: () => fetchHandoverItemTypes(supabase),
    enabled: user !== null,
    staleTime: ITEM_TYPES_STALE_MS,
  });
}

export function useParticipantMaterial(participantId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...participantMaterialRoot(user?.id ?? SIGNED_OUT), participantId],
    queryFn: () => fetchParticipantMaterial(supabase, participantId),
    enabled: user !== null && participantId.length > 0,
  });
}

export function useStockAlerts(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: stockAlertsKey(user?.id ?? SIGNED_OUT),
    queryFn: () => fetchOpenStockAlerts(supabase),
    enabled: enabled && user !== null,
  });
}

export type HandoverOutcome =
  { readonly state: 'saved'; readonly result: HandoverResult } | { readonly state: 'waiting' };

/** The handovers waiting on this phone, and the way to add one. */
export function useHandoverOutbox() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const outbox = useMemo(
    () => (userId === null ? null : createHandoverOutbox(privateStorage, userId)),
    [userId],
  );
  const version = useSyncExternalStore(subscribeToOutbox, readOutboxVersion, readOutboxVersion);
  // `version` is read so the list is taken again after every change.
  const entries = useMemo(
    () => (version >= 0 && outbox !== null ? outbox.list() : NO_ENTRIES),
    [outbox, version],
  );

  const record = useCallback(
    async (input: EnqueueHandover): Promise<HandoverOutcome> => {
      if (outbox === null || userId === null) throw new AppError('AUTH-3');
      outbox.enqueue(input);
      outboxChanged();
      if (!isOnline) return { state: 'waiting' };
      const { delivered } = await drainHandovers(userId, queryClient);
      const result = delivered.find((candidate) => candidate.deliveryId === input.id);
      return result === undefined ? { state: 'waiting' } : { state: 'saved', result };
    },
    [isOnline, outbox, queryClient, userId],
  );
  const retry = useCallback(
    (id: string) => {
      if (outbox === null || userId === null) return;
      outbox.retry(id);
      outboxChanged();
      if (isOnline) void drainHandovers(userId, queryClient);
    },
    [isOnline, outbox, queryClient, userId],
  );
  const discard = useCallback(
    (id: string) => {
      outbox?.discard(id);
      outboxChanged();
    },
    [outbox],
  );
  return { entries, record, retry, discard };
}

export function useRecordReturn(participantId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { readonly deliveryId: string; readonly condition: ReturnCondition }) =>
      recordEquipmentReturn(supabase, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [...participantMaterialRoot(user?.id ?? SIGNED_OUT), participantId],
      }),
  });
}
