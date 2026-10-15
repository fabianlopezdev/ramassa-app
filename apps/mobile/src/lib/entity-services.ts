/**
 * The partner entity's services on the phone (RAPP-414), as the web portal's
 * services pages: her submissions with their status, the team's decisions,
 * one submission with its comments, the contacts she used before, and the
 * actions her submission's status allows (save, delete, resubmit, comment).
 * The database scopes every row to her own entity.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import { fetchServiceCategories, type AdminServiceCategory } from '@ramassa/shared/services';
import {
  addEntityServiceComment,
  deleteEntityService,
  fetchEntityService,
  fetchEntityServiceDecisionNotifications,
  fetchEntityServiceSubmissions,
  fetchOwnServiceContacts,
  fetchServiceSubmissionComments,
  resubmitEntityService,
  saveEntityService,
  type EntityServiceInput,
} from '@ramassa/shared/services/entity';
import { supabase } from './supabase';

const servicesRoot = (userId: string) => ['entity', userId, 'services'] as const;

function useServicesRoot() {
  const { user } = useAuth();
  return { root: servicesRoot(user?.id ?? 'signed-out'), isSignedIn: user !== null };
}

export function useEntityServiceCategories() {
  const { root, isSignedIn } = useServicesRoot();
  return useQuery({
    queryKey: [...root, 'categories'],
    queryFn: ({ signal }) => fetchServiceCategories(supabase, { signal }),
    enabled: isSignedIn,
  });
}

export function useEntityServices() {
  const { root, isSignedIn } = useServicesRoot();
  const services = useQuery({
    queryKey: [...root, 'list'],
    queryFn: () => fetchEntityServiceSubmissions(supabase),
    enabled: isSignedIn,
  });
  const decisions = useQuery({
    queryKey: [...root, 'decisions'],
    queryFn: () => fetchEntityServiceDecisionNotifications(supabase),
    enabled: isSignedIn,
  });
  return { services, decisions };
}

export function useEntityService(serviceId: string) {
  const { root, isSignedIn } = useServicesRoot();
  const service = useQuery({
    queryKey: [...root, 'detail', serviceId],
    queryFn: () => fetchEntityService(supabase, serviceId),
    enabled: isSignedIn,
  });
  const comments = useQuery({
    queryKey: [...root, 'comments', serviceId],
    queryFn: () => fetchServiceSubmissionComments(supabase, serviceId),
    enabled: isSignedIn,
  });
  return { service, comments };
}

export function useOwnServiceContacts() {
  const { root, isSignedIn } = useServicesRoot();
  return useQuery({
    queryKey: [...root, 'contacts'],
    queryFn: () => fetchOwnServiceContacts(supabase),
    enabled: isSignedIn,
  });
}

export function useEntityServiceActions() {
  const { root } = useServicesRoot();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: root });
  const save = useMutation({
    mutationFn: (input: {
      readonly category: AdminServiceCategory;
      readonly service: EntityServiceInput;
      readonly serviceId: string | null;
    }) => saveEntityService(supabase, input.category, input.service, input.serviceId),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (serviceId: string) => deleteEntityService(supabase, serviceId),
    onSuccess: refresh,
  });
  const resubmit = useMutation({
    mutationFn: (serviceId: string) => resubmitEntityService(supabase, serviceId),
    onSuccess: refresh,
  });
  const comment = useMutation({
    mutationFn: (input: { readonly serviceId: string; readonly body: string }) =>
      addEntityServiceComment(supabase, input.serviceId, input.body),
    onSuccess: refresh,
  });
  return { save, remove, resubmit, comment };
}
