import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  createMediaItem,
  fetchMediaItem,
  fetchMediaItems,
  setMediaItemPrivacy,
  type MediaItemInput,
  type MediaItemRow,
  type MediaPrivacy,
} from '@ramassa/shared/media';
import { deleteMediaItem } from '@ramassa/shared/upload-client';
import { cachedListItemInitialDataOptions } from './query-persistence';
import { mobileClientEnv, supabase } from './supabase';

const galleryQueryRoot = 'player-gallery';
const galleryListKey = (userId: string) => [galleryQueryRoot, 'items', userId] as const;
const galleryItemKey = (userId: string, itemId: string) =>
  [galleryQueryRoot, 'item', userId, itemId] as const;

export function useGalleryItems() {
  const { user } = useAuth();
  return useQuery<readonly MediaItemRow[]>({
    queryKey: galleryListKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchMediaItems(supabase, { signal }),
    enabled: user !== null,
  });
}

export function useGalleryItem(itemId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? 'signed-out';
  const queryClient = useQueryClient();
  return useQuery<MediaItemRow>({
    queryKey: galleryItemKey(userId, itemId ?? 'missing'),
    queryFn: ({ signal }) => {
      if (itemId === undefined) throw new AppError('VALIDATION-1');
      return fetchMediaItem(supabase, itemId, { signal });
    },
    ...cachedListItemInitialDataOptions(queryClient, galleryListKey(userId), itemId ?? ''),
    enabled: user !== null && itemId !== undefined,
  });
}

export function useCreateGalleryItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  return useMutation({
    mutationKey: ['create-gallery-item', userId],
    mutationFn: (input: MediaItemInput) => createMediaItem(supabase, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: galleryListKey(userId) }),
  });
}

export function useSetGalleryPrivacy(itemId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  return useMutation({
    mutationKey: ['set-gallery-privacy', userId, itemId],
    mutationFn: async (privacy: MediaPrivacy) => {
      if (itemId === undefined) throw new AppError('VALIDATION-1');
      await setMediaItemPrivacy(supabase, itemId, privacy);
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: galleryListKey(userId) }),
        queryClient.invalidateQueries({ queryKey: galleryItemKey(userId, itemId!) }),
      ]),
  });
}

export function useDeleteGalleryItem(itemId: string | undefined) {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  return useMutation({
    mutationKey: ['delete-gallery-item', userId, itemId],
    mutationFn: async () => {
      if (
        itemId === undefined ||
        session === null ||
        mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL === undefined
      ) {
        throw new AppError('AUTH-2');
      }
      const result = await deleteMediaItem({
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken: session.access_token,
        mediaItemId: itemId,
      });
      if (!result.ok) throw result.error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: galleryListKey(userId) }),
  });
}
