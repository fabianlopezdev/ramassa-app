import { expect, test } from 'bun:test';
import type { KnowledgeArticleListRow } from '@ramassa/shared/knowledge';
import { communityStoriesQueryKey, selectParticipantStories } from './community-stories-select';

const row = (id: string, contentType: KnowledgeArticleListRow['content_type']) =>
  ({ id, content_type: contentType }) as KnowledgeArticleListRow;

test('the Històries segment keeps only participant stories, in the published order', () => {
  const articles = [
    row('guide-1', 'article'),
    row('story-1', 'participant_story'),
    row('guide-2', 'article'),
    row('story-2', 'participant_story'),
  ];
  expect(selectParticipantStories(articles).map((article) => article.id)).toEqual([
    'story-1',
    'story-2',
  ]);
  expect(selectParticipantStories([row('guide-1', 'article')])).toEqual([]);
});

test('stories share the published-articles cache entry, isolated per signed-in player', () => {
  expect(communityStoriesQueryKey('player-a')).toEqual([
    'player-knowledge',
    'articles',
    'player-a',
  ]);
  expect(communityStoriesQueryKey('player-a')).not.toEqual(communityStoriesQueryKey('player-b'));
});
