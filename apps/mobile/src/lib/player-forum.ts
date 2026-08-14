import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  createForumReply,
  deleteOwnForumPost,
  editOwnForumPost,
  fetchForumCategories,
  fetchForumPost,
  fetchForumPosts,
  fetchForumReplies,
  fetchOwnForumPostingStatus,
  flagForumContent,
  type ForumCategoryRow,
  type ForumFlagInput,
  type ForumPostRow,
  type ForumReplyRow,
} from '@ramassa/shared/forum';
import { requireForumWriteOnline, submitForumPostWithDependencies } from './forum-write';
import type { CompressedNativeStoryImage } from './native-image-compression-core';
import { isNetworkStateOnline } from './network-status';
import { cachedListItemInitialDataOptions } from './query-persistence';
import { mobileClientEnv, supabase } from './supabase';

const playerForumQueryRoot = 'player-forum';
const FORUM_POSTING_STATUS_STALE_TIME_MS = 0;

export const playerForumCategoriesQueryKey = (userId: string) =>
  [playerForumQueryRoot, 'categories', userId] as const;
export const playerForumPostsQueryKey = (userId: string) =>
  [playerForumQueryRoot, 'posts', userId] as const;
export const playerForumPostQueryKey = (userId: string, postId: string) =>
  [playerForumQueryRoot, 'post', userId, postId] as const;
export const playerForumRepliesQueryKey = (userId: string, postId: string) =>
  [playerForumQueryRoot, 'replies', userId, postId] as const;
export const ownForumPostingStatusQueryKey = (userId: string) =>
  [playerForumQueryRoot, 'posting-status', userId] as const;

export function useForumCategories() {
  const { user } = useAuth();
  return useQuery<readonly ForumCategoryRow[]>({
    queryKey: playerForumCategoriesQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchForumCategories(supabase, { signal }),
    enabled: user !== null,
  });
}

export function useForumPosts() {
  const { user } = useAuth();
  return useQuery<readonly ForumPostRow[]>({
    queryKey: playerForumPostsQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchForumPosts(supabase, { signal }),
    enabled: user !== null,
  });
}

export function useForumPost(postId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? 'signed-out';
  const queryClient = useQueryClient();
  return useQuery<ForumPostRow>({
    queryKey: playerForumPostQueryKey(userId, postId ?? 'missing-post'),
    queryFn: ({ signal }) => {
      if (postId === undefined) throw new AppError('VALIDATION-1');
      return fetchForumPost(supabase, postId, { signal });
    },
    ...cachedListItemInitialDataOptions<ForumPostRow>(
      queryClient,
      playerForumPostsQueryKey(userId),
      postId ?? '',
    ),
    enabled: user !== null && postId !== undefined,
  });
}

export function useForumReplies(postId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? 'signed-out';
  return useQuery<readonly ForumReplyRow[]>({
    queryKey: playerForumRepliesQueryKey(userId, postId ?? 'missing-post'),
    queryFn: ({ signal }) => {
      if (postId === undefined) throw new AppError('VALIDATION-1');
      return fetchForumReplies(supabase, postId, { signal });
    },
    enabled: user !== null && postId !== undefined,
  });
}

export function useOwnForumPostingStatus() {
  const { user } = useAuth();
  const userId = user?.id ?? 'signed-out';
  return useQuery<boolean>({
    queryKey: ownForumPostingStatusQueryKey(userId),
    queryFn: ({ signal }) => {
      if (user === null) throw new AppError('AUTH-2');
      return fetchOwnForumPostingStatus(supabase, user.id, { signal });
    },
    enabled: user !== null,
    staleTime: FORUM_POSTING_STATUS_STALE_TIME_MS,
  });
}

export function useFlagForumContent(postId: string | undefined) {
  const { user } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  return useMutation({
    mutationKey: ['flag-forum-content', userId],
    networkMode: 'always',
    mutationFn: async (input: ForumFlagInput) => {
      requireForumWriteOnline(isOnline);
      if (user === null) throw new AppError('AUTH-2');
      return flagForumContent(supabase, input);
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: playerForumPostsQueryKey(userId) }),
        ...(postId === undefined
          ? []
          : [
              queryClient.invalidateQueries({
                queryKey: playerForumRepliesQueryKey(userId, postId),
              }),
            ]),
      ]),
  });
}

export interface CreateForumPostVariables {
  readonly categoryId: string;
  readonly content: string;
  readonly image: CompressedNativeStoryImage | null;
}

export function useCreateForumPost() {
  const { user, session } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  return useMutation({
    mutationKey: ['create-forum-post', userId],
    networkMode: 'always',
    mutationFn: (variables: CreateForumPostVariables) =>
      submitForumPostWithDependencies(supabase, {
        ...variables,
        isOnline,
        accessToken: session?.access_token ?? null,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playerForumPostsQueryKey(userId) }),
  });
}

export function useCreateForumReply(postId: string | undefined) {
  const { user } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  return useMutation({
    mutationKey: ['create-forum-reply', userId, postId],
    networkMode: 'always',
    mutationFn: async (content: string) => {
      requireForumWriteOnline(isOnline);
      if (user === null || postId === undefined) throw new AppError('AUTH-2');
      return createForumReply(supabase, { postId, content });
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: playerForumPostsQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: playerForumPostQueryKey(userId, postId!) }),
        queryClient.invalidateQueries({ queryKey: playerForumRepliesQueryKey(userId, postId!) }),
      ]),
  });
}

export function useEditForumPost(postId: string | undefined) {
  const { user } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  return useMutation({
    mutationKey: ['edit-forum-post', userId, postId],
    networkMode: 'always',
    mutationFn: async (content: string) => {
      requireForumWriteOnline(isOnline);
      if (user === null || postId === undefined) throw new AppError('AUTH-2');
      await editOwnForumPost(supabase, { postId, content });
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: playerForumPostsQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: playerForumPostQueryKey(userId, postId!) }),
      ]),
  });
}

export function useDeleteForumPost(postId: string | undefined) {
  const { user } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  return useMutation({
    mutationKey: ['delete-forum-post', userId, postId],
    networkMode: 'always',
    mutationFn: async () => {
      requireForumWriteOnline(isOnline);
      if (user === null || postId === undefined) throw new AppError('AUTH-2');
      await deleteOwnForumPost(supabase, postId);
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: playerForumPostsQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: playerForumPostQueryKey(userId, postId!) }),
      ]),
  });
}
