/**
 * Notifications and targeted push on the phone (RAPP-385), for
 * `notifications.send` holders, as the web admin's workspace: the templates,
 * custom groups and audience options, who exactly an audience reaches right
 * now (live, with their devices), sending a reviewed message in five
 * languages to them, saving it as a template, and the send history. Kept in
 * memory: the audience lists names.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  createTargetedNotificationSend,
  fetchCustomNotificationGroups,
  fetchNotificationAudienceOptions,
  fetchNotificationSendHistory,
  fetchNotificationTemplates,
  previewNotificationAudience,
  saveNotificationTemplate,
  type NotificationAudience,
} from '@ramassa/shared/notifications';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

const notificationsRoot = (userId: string) => ['team', userId, 'notifications'] as const;

/** The templates, custom groups, audience options and history, together. */
export function useNotificationWorkspace() {
  const { user } = useAuth();
  const root = notificationsRoot(user?.id ?? SIGNED_OUT);
  const enabled = user !== null;
  const templates = useQuery({
    queryKey: [...root, 'templates'],
    queryFn: ({ signal }) => fetchNotificationTemplates(supabase, signal),
    enabled,
  });
  const groups = useQuery({
    queryKey: [...root, 'groups'],
    queryFn: ({ signal }) => fetchCustomNotificationGroups(supabase, signal),
    enabled,
  });
  const options = useQuery({
    queryKey: [...root, 'options'],
    queryFn: ({ signal }) => fetchNotificationAudienceOptions(supabase, signal),
    enabled,
  });
  const history = useQuery({
    queryKey: [...root, 'history'],
    queryFn: ({ signal }) => fetchNotificationSendHistory(supabase, signal),
    enabled,
  });
  return { templates, groups, options, history };
}

/** Who the audience reaches right now, with their devices. */
export function useAudiencePreview(audience: NotificationAudience | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...notificationsRoot(user?.id ?? SIGNED_OUT), 'audience', audience],
    queryFn: () => (audience === null ? [] : previewNotificationAudience(supabase, audience)),
    enabled: user !== null && audience !== null,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}

export function useNotificationActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: notificationsRoot(user?.id ?? SIGNED_OUT) });
  const send = useMutation({
    mutationFn: (input: Parameters<typeof createTargetedNotificationSend>[1]) =>
      createTargetedNotificationSend(supabase, input),
    onSuccess: refresh,
  });
  const saveTemplate = useMutation({
    mutationFn: (input: Parameters<typeof saveNotificationTemplate>[1]) =>
      saveNotificationTemplate(supabase, input),
    onSuccess: refresh,
  });
  return { send, saveTemplate };
}
