import { describe, expect, test } from 'bun:test';
import type { KnowledgeArticleListRow, KnowledgeContentType } from '@ramassa/shared/knowledge';
import {
  countPlayerGuidesByCategory,
  filterPlayerGuides,
  LATEST_PLAYER_GUIDES_LIMIT,
  selectLatestPlayerGuides,
  selectPlayerGuides,
} from './player-guides';

function article(
  id: string,
  contentType: KnowledgeContentType,
  categoryId = 'category-a',
): KnowledgeArticleListRow {
  return {
    id,
    category_id: categoryId,
    category: { id: categoryId, name: { ca: 'Tema' }, slug: categoryId, icon: null, sort_order: 0 },
    title: { ca: id },
    body: {},
    image_url: null,
    video_url: null,
    external_url: null,
    content_type: contentType,
    story_status: null,
    submission_language: null,
    story_image_urls: [],
    publication_consent: null,
    publication_consent_at: null,
    publication_consent_version: null,
    author_id: null,
    author_first_name: null,
    created_by: null,
    reviewer_note: null,
    is_published: true,
    published_at: null,
    expires_at: null,
    created_at: '2026-11-16T00:00:00Z',
    updated_at: '2026-11-16T00:00:00Z',
  } as unknown as KnowledgeArticleListRow;
}

const feed = [
  article('story-1', 'participant_story'),
  article('guide-1', 'article'),
  article('guide-2', 'tutorial', 'category-b'),
  article('story-2', 'participant_story', 'category-b'),
  article('guide-3', 'video'),
  article('guide-4', 'external_link', 'category-b'),
];

describe('player guides', () => {
  test('excludes participant stories and keeps the feed order', () => {
    expect(selectPlayerGuides(feed).map((row) => row.id)).toEqual([
      'guide-1',
      'guide-2',
      'guide-3',
      'guide-4',
    ]);
  });

  test('returns an empty list when there is no feed yet', () => {
    expect(selectPlayerGuides(undefined)).toEqual([]);
    expect(selectLatestPlayerGuides(undefined)).toEqual([]);
  });

  test('the latest guides are the first three guides of the newest-first feed', () => {
    expect(LATEST_PLAYER_GUIDES_LIMIT).toBe(3);
    expect(selectLatestPlayerGuides(feed).map((row) => row.id)).toEqual([
      'guide-1',
      'guide-2',
      'guide-3',
    ]);
  });

  test('filters guides by category and keeps every guide under all', () => {
    const guides = selectPlayerGuides(feed);
    expect(filterPlayerGuides(guides, 'all')).toBe(guides);
    expect(filterPlayerGuides(guides, 'category-b').map((row) => row.id)).toEqual([
      'guide-2',
      'guide-4',
    ]);
  });

  test('counts guides per category without stories', () => {
    expect(countPlayerGuidesByCategory(selectPlayerGuides(feed))).toEqual({
      all: 4,
      'category-a': 2,
      'category-b': 2,
    });
  });
});
