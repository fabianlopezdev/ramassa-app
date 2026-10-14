/**
 * The services directory for the team on the phone (RAPP-344): the list with
 * the web admin's status and category filters, one service with its photos,
 * the categories with their extra fields, and deleting. The database decides
 * who may do what: `services.edit` or `services.publish` to read and save,
 * `services.publish` to delete. Kept in memory: the `content` root is not on
 * the disk allow-list.
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  ADMIN_SERVICE_PAGE_SIZE,
  deleteAdminService,
  fetchAdminService,
  fetchAdminServices,
  fetchServiceCategories,
  type ServiceSearch,
} from '@ramassa/shared/services';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

export const contentServicesRoot = (userId: string) => ['content', userId, 'services'] as const;

export function useContentServices(
  status: ServiceSearch['status'],
  category: ServiceSearch['category'],
) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: [...contentServicesRoot(user?.id ?? SIGNED_OUT), 'list', status, category],
    queryFn: ({ pageParam }) => fetchAdminServices(supabase, { status, category, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * ADMIN_SERVICE_PAGE_SIZE < last.total ? pages.length + 1 : undefined,
    enabled: user !== null,
    placeholderData: keepPreviousData,
  });
}

export function useContentService(serviceId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...contentServicesRoot(user?.id ?? SIGNED_OUT), 'one', serviceId],
    queryFn: () => fetchAdminService(supabase, serviceId),
    enabled: user !== null && serviceId.length > 0,
  });
}

export function useContentServiceCategories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...contentServicesRoot(user?.id ?? SIGNED_OUT), 'categories'],
    queryFn: ({ signal }) => fetchServiceCategories(supabase, { signal }),
    enabled: user !== null,
  });
}

export function useServiceActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => deleteAdminService(supabase, id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: contentServicesRoot(user?.id ?? SIGNED_OUT) }),
  });
  return { remove };
}
