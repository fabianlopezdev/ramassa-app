/**
 * Translation keys for a knowledge resource's type and status (RAPP-343), as
 * the web admin names them. A participant story shows its review state; a
 * staff resource shows its publication state.
 */
import {
  getAnnouncementLifecycle,
  type AnnouncementLifecycle,
} from '@ramassa/shared/announcements';
import { resolveLocalizedText } from '@ramassa/shared/i18n';
import type {
  KnowledgeArticleListRow,
  KnowledgeContentType,
  StoryStatus,
} from '@ramassa/shared/knowledge';

export const KNOWLEDGE_TYPE_KEYS = {
  article: 'typeArticle',
  tutorial: 'typeTutorial',
  video: 'typeVideo',
  external_link: 'typeExternalLink',
  participant_story: 'typeParticipantStory',
} as const satisfies Record<KnowledgeContentType, string>;

export const STORY_STATUS_KEYS = {
  submitted: 'statusSubmitted',
  in_review: 'statusInReview',
  changes_requested: 'statusChangesRequested',
  published: 'statusPublished',
  rejected: 'statusRejected',
} as const satisfies Record<StoryStatus, string>;

const LIFECYCLE_KEYS = {
  draft: 'statusDraft',
  published: 'statusPublished',
  scheduled: 'statusScheduled',
  expired: 'statusExpired',
} as const satisfies Record<AnnouncementLifecycle, string>;

export function knowledgeStatusKey(article: KnowledgeArticleListRow): string {
  if (article.story_status !== null) return STORY_STATUS_KEYS[article.story_status];
  return LIFECYCLE_KEYS[
    getAnnouncementLifecycle({
      status: article.is_published ? 'published' : 'draft',
      publishedAt: article.published_at,
      expiresAt: article.expires_at,
    })
  ];
}

/** The title in Catalan, or in another language when there is no Catalan yet (a new story). */
export function knowledgeTitle(article: KnowledgeArticleListRow): string {
  return resolveLocalizedText(article.title, 'ca')?.text ?? '';
}
