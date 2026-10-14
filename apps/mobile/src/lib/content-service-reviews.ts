/**
 * The review queue of services that partner entities send (RAPP-345), for
 * `services.review` holders: the queue with the web admin's filters, how many
 * items wait (for Today), one item with the service, its comment thread and,
 * for a change to a live service, the before-and-after snapshot. Rejecting
 * needs a comment the entity reads; the entity can then correct the service
 * and send it again, which is how changes are asked for. Approving publishes
 * through the service form (`service-form.tsx`). Kept in memory: the
 * `content` root is not on the disk allow-list.
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
  fetchAdminService,
  fetchServiceReviewNotification,
  fetchServiceReviewQueue,
  markServiceReviewNotificationRead,
  rejectEntityService,
  SERVICE_REVIEW_PAGE_SIZE,
  type ServiceReviewSearch,
} from '@ramassa/shared/services';
import {
  addStaffServiceComment,
  fetchServiceSubmissionComments,
  type StaffServiceCommentVisibility,
} from '@ramassa/shared/services/entity';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

export const serviceReviewsRoot = (userId: string) =>
  ['content', userId, 'service-reviews'] as const;

export function useServiceReviewQueue(
  kind: ServiceReviewSearch['kind'],
  category: ServiceReviewSearch['category'],
  query: string,
) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: [...serviceReviewsRoot(user?.id ?? SIGNED_OUT), 'queue', kind, category, query],
    queryFn: ({ pageParam }) =>
      fetchServiceReviewQueue(supabase, { kind, category, query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * SERVICE_REVIEW_PAGE_SIZE < last.total ? pages.length + 1 : undefined,
    enabled: user !== null,
    placeholderData: keepPreviousData,
  });
}

/** How many items wait for review, for Today. */
export function useServiceReviewCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...serviceReviewsRoot(user?.id ?? SIGNED_OUT), 'count'],
    queryFn: async () =>
      (
        await fetchServiceReviewQueue(supabase, {
          kind: 'all',
          category: 'all',
          query: '',
          page: 1,
        })
      ).total,
    enabled: user !== null,
  });
}

/** The service, its thread and, for a change to a live service, the snapshot. */
export function useServiceReview(serviceId: string, notificationId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...serviceReviewsRoot(user?.id ?? SIGNED_OUT), 'one', serviceId, notificationId],
    queryFn: async () => {
      const [detail, comments, notification] = await Promise.all([
        fetchAdminService(supabase, serviceId),
        fetchServiceSubmissionComments(supabase, serviceId),
        notificationId === null
          ? Promise.resolve(null)
          : fetchServiceReviewNotification(supabase, notificationId),
      ]);
      return { detail, comments, notification };
    },
    enabled: user !== null && serviceId.length > 0,
  });
}

export function useServiceReviewActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: serviceReviewsRoot(user?.id ?? SIGNED_OUT) }),
      queryClient.invalidateQueries({ queryKey: ['content', user?.id ?? SIGNED_OUT, 'services'] }),
    ]);
  const reject = useMutation({
    mutationFn: (input: { readonly serviceId: string; readonly comment: string }) =>
      rejectEntityService(supabase, input.serviceId, input.comment),
    onSuccess: refresh,
  });
  const comment = useMutation({
    mutationFn: (input: {
      readonly serviceId: string;
      readonly body: string;
      readonly visibility: StaffServiceCommentVisibility;
    }) => addStaffServiceComment(supabase, input.serviceId, input.body, input.visibility),
    onSuccess: refresh,
  });
  const markReviewed = useMutation({
    mutationFn: (notificationId: string) =>
      markServiceReviewNotificationRead(supabase, notificationId),
    onSuccess: refresh,
  });
  return { reject, comment, markReviewed };
}
