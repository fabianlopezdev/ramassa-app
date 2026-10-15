/**
 * Gallery moderation on the phone (RAPP-381), for `gallery.moderate` holders:
 * every gallery photo and video, newest first, also hidden ones, and what the
 * team does with each: hide it or show it again (its open reports close and
 * the change is audited), or remove it with its files through the media
 * Worker. Reported items also show in forum moderation. Kept in memory.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  fetchMediaItems,
  setMediaItemModeration,
  type GalleryModerationState,
} from '@ramassa/shared/media';
import { deleteMediaItem } from '@ramassa/shared/upload-client';
import { mobileClientEnv, supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

const galleryRoot = (userId: string) => ['team', userId, 'gallery'] as const;

export function useTeamGallery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...galleryRoot(user?.id ?? SIGNED_OUT), 'items'],
    queryFn: ({ signal }) => fetchMediaItems(supabase, { signal }),
    enabled: user !== null,
  });
}

export function useGalleryModerationActions() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: galleryRoot(user?.id ?? SIGNED_OUT) }),
      // A reported item leaves forum moderation once it is handled here.
      queryClient.invalidateQueries({
        queryKey: ['team', user?.id ?? SIGNED_OUT, 'forum-moderation'],
      }),
    ]);
  const setState = useMutation({
    mutationFn: (input: { readonly id: string; readonly state: GalleryModerationState }) =>
      setMediaItemModeration(supabase, input.id, input.state),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const mediaWorkerUrl = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
      if (session === null || mediaWorkerUrl === undefined) throw new AppError('AUTH-2');
      const result = await deleteMediaItem({
        mediaWorkerUrl,
        accessToken: session.access_token,
        mediaItemId: id,
      });
      if (!result.ok) throw result.error;
    },
    onSuccess: refresh,
  });
  return { setState, remove };
}
