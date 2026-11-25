import { describe, expect, test } from 'bun:test';
import type {
  KnowledgeArticleListRow,
  KnowledgeCategoryRow,
  KnowledgeContentType,
} from '@ramassa/shared/knowledge';
import {
  countPlayerGuidesByCategory,
  filterPlayerGuides,
  selectBaseDocuments,
  selectGuideCategories,
  selectPlayerGuides,
  withoutBaseDocuments,
} from './player-guides';

function article(
  id: string,
  contentType: KnowledgeContentType,
  categoryId = 'category-a',
  isBaseDocuments = false,
): KnowledgeArticleListRow {
  return {
    id,
    category_id: categoryId,
    category: {
      id: categoryId,
      name: { ca: 'Tema' },
      slug: categoryId,
      icon: null,
      sort_order: 0,
      is_base_documents: isBaseDocuments,
    },
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

  test('keeps only the categories that hold at least one guide, in their order', () => {
    const categories = ['category-a', 'stories-only', 'category-b'].map(
      (id) =>
        ({
          id,
          name: { ca: id },
          slug: id,
          icon: null,
          sort_order: 0,
        }) as unknown as KnowledgeCategoryRow,
    );
    const counts = countPlayerGuidesByCategory(selectPlayerGuides(feed));
    expect(selectGuideCategories(categories, counts).map((row) => row.id)).toEqual([
      'category-a',
      'category-b',
    ]);
    expect(selectGuideCategories(undefined, counts)).toEqual([]);
  });
});

describe('the club base documents (RAPP-972)', () => {
  const baseCategory = {
    id: 'base',
    name: { ca: 'Protocols i documents base' },
    slug: 'protocols-i-documents-base',
    icon: 'document',
    color: 'indigo',
    sort_order: 0,
    is_base_documents: true,
  } as unknown as KnowledgeCategoryRow;
  const guideCategory = { ...baseCategory, id: 'guides', is_base_documents: false };

  test('they stay out of the Guies list and its categories', () => {
    const guides = [article('a', 'article', 'guides'), article('b', 'article', 'base', true)];
    expect(withoutBaseDocuments(guides).map((guide) => guide.id)).toEqual(['a']);
    expect(
      selectGuideCategories([baseCategory, guideCategory], { base: 1, guides: 1 }).map(
        (category) => category.id,
      ),
    ).toEqual(['guides']);
  });

  test('the Documents segment lists only the base documents, and none means no segment', () => {
    const articles = [article('a', 'article', 'guides'), article('b', 'article', 'base', true)];
    expect(selectBaseDocuments(articles).map((document) => document.id)).toEqual(['b']);
    expect(selectBaseDocuments([article('a', 'article', 'guides')])).toEqual([]);
    expect(selectBaseDocuments(undefined)).toEqual([]);
  });
});
