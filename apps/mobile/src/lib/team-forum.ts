/**
 * Forum moderation on the phone (RAPP-380), for `forum.moderate` holders, as
 * the web admin's moderation screen: the reported posts, replies and gallery
 * photos, oldest report first, and what the team does with each one. Dismiss
 * clears the reports, Hide takes the content out of the forum, Delete removes
 * it (a photo through the media Worker, which also removes its files). A post
 * can also be pinned or moved to another category, and the author can be
 * contacted. Kept in memory: player content is not cached on the disk.
 * The forum categories are managed here too (RAPP-386).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  contactForumAuthor,
  deleteForumCategory,
  fetchForumCategories,
  fetchForumModerationQueue,
  moderateForumTarget,
  saveForumCategory,
  setForumPostCategory,
  setForumPostPinned,
  type ForumCategoryInput,
  type ForumCategoryRow,
  type ForumModerationAction,
  type ForumModerationQueueRow,
} from '@ramassa/shared/forum';
import { deleteMediaItem } from '@ramassa/shared/upload-client';
import { mobileClientEnv, supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

const forumModerationRoot = (userId: string) => ['team', userId, 'forum-moderation'] as const;

export function useForumModerationQueue() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...forumModerationRoot(user?.id ?? SIGNED_OUT), 'queue'],
    queryFn: () => fetchForumModerationQueue(supabase),
    enabled: user !== null,
  });
}

export function useForumModerationCategories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...forumModerationRoot(user?.id ?? SIGNED_OUT), 'categories'],
    queryFn: () => fetchForumCategories(supabase),
    enabled: user !== null,
  });
}

/** One queue item as a single key: what kind of content, and which one. */
export function moderationKey(row: Pick<ForumModerationQueueRow, 'target_type' | 'target_id'>) {
  return `${row.target_type}:${row.target_id}`;
}

export type ForumModerationRequest =
  | { readonly kind: 'moderate'; readonly action: ForumModerationAction }
  | { readonly kind: 'pin'; readonly pinned: boolean }
  | { readonly kind: 'category'; readonly categoryId: string };

export function useForumModerationActions() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: forumModerationRoot(user?.id ?? SIGNED_OUT) });

  const act = useMutation({
    mutationFn: async (input: {
      readonly row: ForumModerationQueueRow;
      readonly request: ForumModerationRequest;
    }) => {
      const { row, request } = input;
      if (request.kind === 'pin')
        return setForumPostPinned(supabase, row.target_id, request.pinned);
      if (request.kind === 'category') {
        return setForumPostCategory(supabase, row.target_id, request.categoryId);
      }
      // A reported photo is deleted with its files, through the media Worker.
      if (row.target_type === 'media' && request.action === 'delete') {
        const mediaWorkerUrl = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
        if (session === null || mediaWorkerUrl === undefined) throw new AppError('AUTH-2');
        const result = await deleteMediaItem({
          mediaWorkerUrl,
          accessToken: session.access_token,
          mediaItemId: row.target_id,
        });
        if (!result.ok) throw result.error;
        return undefined;
      }
      return moderateForumTarget(supabase, {
        targetType: row.target_type,
        targetId: row.target_id,
        action: request.action,
      });
    },
    onSuccess: refresh,
  });

  const contact = useMutation({
    mutationFn: (authorId: string) => contactForumAuthor(supabase, authorId),
  });

  return { act, contact };
}

/** A category as the save call takes it, with a new order or not. */
function forumCategoryInput(
  category: ForumCategoryRow,
  sortOrder = category.sort_order,
): ForumCategoryInput {
  return {
    id: category.id,
    name: {
      ca: category.name.ca ?? '',
      es: category.name.es ?? '',
      en: category.name.en ?? '',
      ar: category.name.ar ?? '',
      fa: category.name.fa ?? '',
    },
    slug: category.slug,
    icon: category.icon,
    color: category.color,
    sortOrder,
  };
}

/**
 * Save, delete and reorder the forum categories (RAPP-386). A new order is
 * saved as 10, 20, 30 and on, as the seeded categories are numbered, and only
 * the categories whose number changes are saved.
 */
export function useForumCategoryActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: forumModerationRoot(user?.id ?? SIGNED_OUT) });
  const save = useMutation({
    mutationFn: (input: ForumCategoryInput) => saveForumCategory(supabase, input),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (categoryId: string) => deleteForumCategory(supabase, categoryId),
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: async (ordered: readonly ForumCategoryRow[]) => {
      for (const [index, category] of ordered.entries()) {
        const sortOrder = (index + 1) * 10;
        if (category.sort_order !== sortOrder) {
          await saveForumCategory(supabase, forumCategoryInput(category, sortOrder));
        }
      }
    },
    onSettled: refresh,
  });
  return { save, remove, reorder };
}
