import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  applyOptimisticServiceInterest,
  fetchPlayerService,
  fetchPlayerServices,
  fetchServiceCategories,
  setPlayerServiceInterest,
  type AdminServiceCategory,
  type PlayerServiceRow,
  type ServiceAvailability,
  type ServiceCostType,
} from '@ramassa/shared/services';
import { isNetworkStateOnline } from './network-status';
import { supabase } from './supabase';

const playerServicesQueryRoot = 'player-services';

export interface PlayerServiceFilterSelection {
  readonly zone?: string;
  readonly costType?: ServiceCostType;
  readonly availability?: ServiceAvailability;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const EMPTY_METADATA_FILTERS: Readonly<Record<string, unknown>> = {};

function stableFilterSignature(filters: PlayerServiceFilterSelection): string {
  const metadata = Object.fromEntries(
    Object.entries(filters.metadata ?? EMPTY_METADATA_FILTERS).sort(([first], [second]) =>
      first.localeCompare(second),
    ),
  );
  if (
    filters.zone === undefined &&
    filters.costType === undefined &&
    filters.availability === undefined &&
    Object.keys(metadata).length === 0
  ) {
    return 'unfiltered';
  }
  return JSON.stringify({
    zone: filters.zone,
    costType: filters.costType,
    availability: filters.availability,
    metadata,
  });
}

export const playerServiceCategoriesQueryKey = (userId: string) =>
  [playerServicesQueryRoot, 'categories', userId] as const;

export const playerServicesQueryKey = (
  userId: string,
  categoryId: string,
  filters: PlayerServiceFilterSelection,
) => [playerServicesQueryRoot, 'list', userId, categoryId, stableFilterSignature(filters)] as const;

export const playerServiceDetailQueryKey = (userId: string, serviceId: string) =>
  [playerServicesQueryRoot, 'detail', userId, serviceId] as const;

export function usePlayerServiceCategories() {
  const { user } = useAuth();
  return useQuery<readonly AdminServiceCategory[]>({
    queryKey: playerServiceCategoriesQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchServiceCategories(supabase, { signal }),
    enabled: user !== null,
  });
}

export function usePlayerServices(
  category: AdminServiceCategory | null,
  filters: PlayerServiceFilterSelection,
) {
  const { user } = useAuth();
  const userId = user?.id ?? 'signed-out';
  const categoryId = category?.id ?? 'no-category';
  return useQuery<readonly PlayerServiceRow[]>({
    queryKey: playerServicesQueryKey(userId, categoryId, filters),
    queryFn: ({ signal }) => {
      if (category === null) throw new AppError('VALIDATION-1');
      return fetchPlayerServices(
        supabase,
        {
          categoryId: category.id,
          categorySlug: category.definition.slug as never,
          categoryContract: category.contract,
          zone: filters.zone,
          costType: filters.costType,
          availability: filters.availability,
          metadata: filters.metadata,
        },
        { signal },
      );
    },
    enabled: user !== null && category !== null,
  });
}

export function usePlayerServiceDetail(serviceId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? 'signed-out';
  const queryClient = useQueryClient();
  return useQuery<PlayerServiceRow>({
    queryKey: playerServiceDetailQueryKey(userId, serviceId ?? 'missing-service'),
    queryFn: ({ signal }) => {
      if (serviceId === undefined) throw new AppError('VALIDATION-1');
      return fetchPlayerService(supabase, serviceId, { signal });
    },
    initialData: () => {
      if (serviceId === undefined) return undefined;
      for (const [, services] of queryClient.getQueriesData<readonly PlayerServiceRow[]>({
        queryKey: [playerServicesQueryRoot, 'list', userId],
      })) {
        const match = services?.find((service) => service.id === serviceId);
        if (match !== undefined) return match;
      }
      return undefined;
    },
    enabled: user !== null && serviceId !== undefined,
  });
}

export function useServiceInterest() {
  const { user } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';

  return useMutation({
    mutationKey: ['service-interest', userId],
    networkMode: 'always',
    mutationFn: async ({
      serviceId,
      interested,
    }: {
      readonly serviceId: string;
      readonly interested: boolean;
    }) => {
      if (!isOnline) throw new AppError('NETWORK-1');
      if (user === null) throw new AppError('AUTH-2');
      return setPlayerServiceInterest(supabase, { serviceId, interested });
    },
    onMutate: async ({ serviceId, interested }) => {
      await queryClient.cancelQueries({ queryKey: [playerServicesQueryRoot] });
      const listSnapshots = queryClient.getQueriesData<readonly PlayerServiceRow[]>({
        queryKey: [playerServicesQueryRoot, 'list', userId],
      });
      for (const [queryKey, services] of listSnapshots) {
        if (services !== undefined) {
          queryClient.setQueryData(
            queryKey,
            applyOptimisticServiceInterest(services, serviceId, interested),
          );
        }
      }
      const detailKey = playerServiceDetailQueryKey(userId, serviceId);
      const detailSnapshot = queryClient.getQueryData<PlayerServiceRow>(detailKey);
      if (detailSnapshot !== undefined) {
        queryClient.setQueryData(detailKey, { ...detailSnapshot, interested });
      }
      return { listSnapshots, detailKey, detailSnapshot };
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, services] of context?.listSnapshots ?? []) {
        queryClient.setQueryData(queryKey, services);
      }
      if (context?.detailSnapshot !== undefined) {
        queryClient.setQueryData(context.detailKey, context.detailSnapshot);
      }
    },
    onSettled: (_data, _error, variables) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [playerServicesQueryRoot, 'list', userId] }),
        queryClient.invalidateQueries({
          queryKey: playerServiceDetailQueryKey(userId, variables.serviceId),
        }),
      ]),
  });
}
