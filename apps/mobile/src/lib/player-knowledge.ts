import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  fetchKnowledgeArticle,
  fetchKnowledgeCategories,
  fetchOwnParticipantStoryStatuses,
  fetchPlayerKnowledgeArticles,
  submitParticipantStory,
  type KnowledgeArticleListRow,
  type KnowledgeCategoryRow,
  type ParticipantStoryStatusRow,
} from '@ramassa/shared/knowledge';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { STORY_CONSENT_VERSION } from '@ramassa/shared/story-submission';
import { uploadFile } from '@ramassa/shared/upload-client';
import type { CompressedNativeStoryImage } from './native-image-compression-core';
import { isNetworkStateOnline } from './network-status';
import { logger } from './observability';
import { cachedListItemInitialDataOptions } from './query-persistence';
import { requireStorySubmissionOnline } from './story-submission-policy';
import { mobileClientEnv, supabase } from './supabase';

const playerKnowledgeQueryRoot = 'player-knowledge';

export const playerKnowledgeCategoriesQueryKey = (userId: string) =>
  [playerKnowledgeQueryRoot, 'categories', userId] as const;
export const playerKnowledgeArticlesQueryKey = (userId: string) =>
  [playerKnowledgeQueryRoot, 'articles', userId] as const;
export const playerOwnStoryStatusesQueryKey = (userId: string) =>
  [playerKnowledgeQueryRoot, 'own-stories', userId] as const;

export function usePlayerKnowledgeCategories() {
  const { user } = useAuth();
  return useQuery<readonly KnowledgeCategoryRow[]>({
    queryKey: playerKnowledgeCategoriesQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchKnowledgeCategories(supabase, { signal }),
    enabled: user !== null,
  });
}

export function usePlayerKnowledgeArticles() {
  const { user } = useAuth();
  return useQuery<readonly KnowledgeArticleListRow[]>({
    queryKey: playerKnowledgeArticlesQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchPlayerKnowledgeArticles(supabase, { signal }),
    enabled: user !== null,
  });
}

export function usePlayerKnowledgeArticle(articleId: string | undefined) {
  const { user } = useAuth();
  const articlesQueryKey = playerKnowledgeArticlesQueryKey(user?.id ?? 'signed-out');
  const queryClient = useQueryClient();
  return useQuery<KnowledgeArticleListRow>({
    queryKey: [playerKnowledgeQueryRoot, 'detail', user?.id ?? 'signed-out', articleId],
    queryFn: ({ signal }) => {
      if (articleId === undefined) throw new AppError('VALIDATION-1');
      return fetchKnowledgeArticle(supabase, articleId, { signal });
    },
    ...cachedListItemInitialDataOptions<KnowledgeArticleListRow>(
      queryClient,
      articlesQueryKey,
      articleId ?? '',
    ),
    enabled: user !== null && articleId !== undefined,
  });
}

export function useOwnParticipantStoryStatuses() {
  const { user } = useAuth();
  return useQuery<readonly ParticipantStoryStatusRow[]>({
    queryKey: playerOwnStoryStatusesQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => {
      if (user === null) throw new AppError('AUTH-2');
      return fetchOwnParticipantStoryStatuses(supabase, user.id, { signal });
    },
    enabled: user !== null,
  });
}

export interface SubmitPlayerStoryVariables {
  readonly categoryId: string;
  readonly language: LanguageCode;
  readonly title: string;
  readonly story: string;
  readonly images: readonly CompressedNativeStoryImage[];
}

export function useSubmitPlayerStory() {
  const { user, session } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const statusQueryKey = playerOwnStoryStatusesQueryKey(user?.id ?? 'signed-out');

  return useMutation({
    mutationKey: ['submit-player-story', user?.id ?? 'signed-out'],
    networkMode: 'always',
    mutationFn: async ({
      categoryId,
      language,
      title,
      story,
      images,
    }: SubmitPlayerStoryVariables) => {
      requireStorySubmissionOnline(isOnline);
      if (user === null || session === null) throw new AppError('AUTH-2');
      const mediaWorkerUrl = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
      if (images.length > 0 && mediaWorkerUrl === undefined) throw new AppError('UPLOAD-1');

      const uploaded = await Promise.all(
        images.map(async (image) => {
          const result = await uploadFile({
            mediaWorkerUrl: mediaWorkerUrl!,
            accessToken: session.access_token,
            folder: 'stories',
            file: image,
            onError: (error) => logger.error('story image upload failed', { code: error.code }),
          });
          if (!result.ok) throw result.error;
          return result.value.objectKey;
        }),
      );

      return submitParticipantStory(supabase, {
        categoryId,
        authorId: user.id,
        language,
        title,
        story,
        imageObjectKeys: uploaded,
        publicationConsent: true,
        consentVersion: STORY_CONSENT_VERSION,
      });
    },
    onSuccess: (story) => {
      queryClient.setQueryData<readonly ParticipantStoryStatusRow[]>(
        statusQueryKey,
        (current = []) => [
          {
            id: story.id,
            story_status: story.story_status!,
            created_at: story.created_at,
            updated_at: story.updated_at,
          },
          ...current.filter((row) => row.id !== story.id),
        ],
      );
    },
  });
}
