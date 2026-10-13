/**
 * Stock and goods received on the phone (RAPP-250). Arrivals need a
 * connection; the form makes the arrival's id once, so pressing Save again
 * after a lost answer saves nothing twice. None of these reads is persisted
 * to disk.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchCheckoutRecipients,
  fetchMonthlyCount,
  fetchOpenCheckouts,
  fetchRecentArrivals,
  fetchStockLevels,
  recordEquipmentArrival,
  recordStaffCheckin,
  recordStaffCheckout,
  recordStockCount,
  type ArrivalInput,
  type CountLine,
  type CountReason,
  type ReturnCondition,
} from '@ramassa/shared/equipment';
import { AppError } from '@ramassa/shared/errors';
import { uploadFile } from '@ramassa/shared/upload-client';
import { compressNativeStoryImage } from './native-image-compression';
import { mobileClientEnv, supabase } from './supabase';

const SIGNED_OUT = 'signed-out';
const stockRoot = (userId: string) => ['stock', userId] as const;

export function useStockLevels() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...stockRoot(user?.id ?? SIGNED_OUT), 'levels'],
    queryFn: () => fetchStockLevels(supabase),
    enabled: user !== null,
  });
}

export function useRecentArrivals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...stockRoot(user?.id ?? SIGNED_OUT), 'arrivals'],
    queryFn: () => fetchRecentArrivals(supabase),
    enabled: user !== null,
  });
}

export function useRecordArrival() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ArrivalInput) => recordEquipmentArrival(supabase, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: stockRoot(user?.id ?? SIGNED_OUT) }),
        queryClient.invalidateQueries({ queryKey: ['stock-alerts', user?.id ?? SIGNED_OUT] }),
      ]),
  });
}

/** The item Today asks to count this month (RAPP-251), or null when done. */
export function useMonthlyCount(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...stockRoot(user?.id ?? SIGNED_OUT), 'monthly-count'],
    queryFn: () => fetchMonthlyCount(supabase),
    enabled: enabled && user !== null,
  });
}

export function useRecordCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      readonly id: string;
      readonly itemTypeId: string;
      readonly lines: readonly CountLine[];
      readonly reason: CountReason | null;
      readonly note: string;
    }) => recordStockCount(supabase, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: stockRoot(user?.id ?? SIGNED_OUT) }),
        queryClient.invalidateQueries({ queryKey: ['stock-alerts', user?.id ?? SIGNED_OUT] }),
      ]),
  });
}

/** Open checkouts (RAPP-252): all of them for the storeroom, hers for a staff member. */
export function useOpenCheckouts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...stockRoot(user?.id ?? SIGNED_OUT), 'checkouts'],
    queryFn: () => fetchOpenCheckouts(supabase),
    enabled: user !== null,
  });
}

export function useCheckoutRecipients() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...stockRoot(user?.id ?? SIGNED_OUT), 'checkout-recipients'],
    queryFn: () => fetchCheckoutRecipients(supabase),
    enabled: user !== null,
  });
}

export function useRecordCheckout() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof recordStaffCheckout>[1]) =>
      recordStaffCheckout(supabase, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockRoot(user?.id ?? SIGNED_OUT) }),
  });
}

export function useRecordCheckin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      readonly checkoutId: string;
      readonly returned: number;
      readonly condition: ReturnCondition | null;
    }) => recordStaffCheckin(supabase, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockRoot(user?.id ?? SIGNED_OUT) }),
  });
}

export interface ArrivalPhotoDraft {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

/** Compresses and uploads one photo to the staff-only stock folder; returns its key. */
export async function uploadArrivalPhoto(
  draft: ArrivalPhotoDraft,
  accessToken: string,
): Promise<string> {
  const mediaWorkerUrl = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
  if (mediaWorkerUrl === undefined) throw new AppError('UPLOAD-1');
  const image = await compressNativeStoryImage(draft);
  const uploaded = await uploadFile({ mediaWorkerUrl, accessToken, folder: 'stock', file: image });
  if (!uploaded.ok) throw uploaded.error;
  return uploaded.value.objectKey;
}
