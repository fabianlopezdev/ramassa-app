/**
 * Tester ground (RAPP-885), the Comunitat tab: the forum with its categories,
 * posts and replies, the gallery and the stories.
 *
 * What a tester sees as new (`my_tab_news()`): seven of the ten forum posts,
 * three new replies on the post she wrote herself, nine of the twelve photos
 * and three of the four stories. The rest is dated days back, before she could
 * count it as new, so the lists also show things she has already seen.
 */

import {
  COMPANIONS,
  gid,
  img,
  jsonb,
  lit,
  minutesAgo,
  ORG,
  TEAM,
  TESTERS,
  uid,
  type Account,
  type GroundModule,
  type Translated,
} from '../lib/ground';
import {
  FORUM_CATEGORIES,
  FORUM_POSTS,
  GALLERY_ITEMS,
  STORIES,
  STORY_CATEGORY,
  TESTER_POSTS,
  type AuthorKey,
  type ReplySeed,
} from './comunitat/content';

const MODULE = 'comunitat';
const GALLERY_CONSENT_VERSION = 'gallery-consent-v1';
const STORY_CONSENT_VERSION = 'story-publication-v1';
/** Her own post was written some days after she joined (accounts join 30 days before the run). */
const TESTER_POST_DAYS_AGO = 20;

const AUTHORS: Readonly<Record<AuthorKey, Account>> = Object.fromEntries(
  [TEAM, ...COMPANIONS].map((account) => [account.key, account]),
) as Record<AuthorKey, Account>;

function author(key: AuthorKey): Account {
  return AUTHORS[key];
}

/** A moment before the run: minutes for new things, days for things already seen. */
function moment(when: { readonly minutesAgo?: number; readonly daysAgo?: number }): string {
  if (when.minutesAgo !== undefined) return minutesAgo(when.minutesAgo);
  if (when.daysAgo !== undefined) return `(now() - interval '${when.daysAgo} days')`;
  throw new Error('A dated row needs minutesAgo or daysAgo');
}

const ids = {
  forumCategory: (slug: string) => `${MODULE}:forum-category:${slug}`,
  post: (key: string) => `${MODULE}:post:${key}`,
  reply: (key: string) => `${MODULE}:reply:${key}`,
  testerPost: (tester: Account) => `${MODULE}:tester-post:${tester.key}`,
  testerReply: (tester: Account, key: string) => `${MODULE}:tester-reply:${tester.key}:${key}`,
  gallery: (image: string) => `${MODULE}:gallery:${image}`,
  storyCategory: () => `${MODULE}:story-category`,
  story: (key: string) => `${MODULE}:story:${key}`,
};

function uuidList(slugs: readonly string[]): string {
  return slugs.map((slug) => `'${gid(slug)}'`).join(', ');
}

const forumCategorySlugs = FORUM_CATEGORIES.map((category) => ids.forumCategory(category.slug));
const postSlugs = [
  ...FORUM_POSTS.map((post) => ids.post(post.key)),
  ...TESTERS.map((tester) => ids.testerPost(tester)),
];
const gallerySlugs = GALLERY_ITEMS.map((item) => ids.gallery(item.image));
const storySlugs = STORIES.map((story) => ids.story(story.key));

// --- Forum -------------------------------------------------------------------------------------

function forumCategoriesSql(): string {
  const rows = FORUM_CATEGORIES.map(
    (category) =>
      `  (${uid(ids.forumCategory(category.slug))}, ${ORG}, ${jsonb(category.name)}, ${lit(category.slug)}, ` +
      `${lit(category.icon)}, ${lit(category.color)}, ${category.sortOrder})`,
  );
  return [
    'insert into public.forum_categories (id, org_id, name, slug, icon, color, sort_order)',
    'values',
    rows.join(',\n'),
    'on conflict (id) do nothing;',
  ].join('\n');
}

interface PostRow {
  readonly id: string;
  readonly category: string;
  readonly author: Account;
  readonly content: string;
  readonly imageKey: string | null;
  readonly pinned: boolean;
  readonly at: string;
}

function postsSql(rows: readonly PostRow[]): string {
  const values = rows.map(
    (row) =>
      `  (${uid(row.id)}, ${ORG}, ${uid(ids.forumCategory(row.category))}, ${uid(row.author.key)}, ` +
      `${lit(row.author.firstName)}, ${lit(row.content)}, ${row.imageKey ?? 'null'}, ${row.pinned}, ` +
      `${row.at}, ${row.at})`,
  );
  return [
    'insert into public.forum_posts',
    '  (id, org_id, category_id, author_id, author_first_name, content, image_url, is_pinned, created_at, updated_at)',
    'values',
    values.join(',\n'),
    'on conflict (id) do nothing;',
  ].join('\n');
}

interface ReplyRow {
  readonly id: string;
  readonly postId: string;
  readonly author: Account;
  readonly content: string;
  readonly at: string;
}

function repliesSql(rows: readonly ReplyRow[]): string {
  if (rows.length === 0) return '';
  const values = rows.map(
    (row) =>
      `  (${uid(row.id)}, ${ORG}, ${uid(row.postId)}, ${uid(row.author.key)}, ${lit(row.author.firstName)}, ` +
      `${lit(row.content)}, ${row.at}, ${row.at})`,
  );
  // The reply count on each post is kept by a trigger on insert, so a reply
  // that already exists is skipped and never counted twice.
  return [
    'insert into public.forum_replies',
    '  (id, org_id, post_id, author_id, author_first_name, content, created_at, updated_at)',
    'values',
    values.join(',\n'),
    'on conflict (id) do nothing;',
  ].join('\n');
}

function companionPostRows(): PostRow[] {
  return FORUM_POSTS.map((post) => ({
    id: ids.post(post.key),
    category: post.category,
    author: author(post.author),
    content: post.content,
    imageKey: post.image === undefined ? null : img(post.image),
    pinned: post.pinned ?? false,
    at: moment(post),
  }));
}

function companionReplyRows(): ReplyRow[] {
  return FORUM_POSTS.flatMap((post) =>
    post.replies.map((reply) => ({
      id: ids.reply(reply.key),
      postId: ids.post(post.key),
      author: author(reply.author),
      content: reply.content,
      at: moment(reply),
    })),
  );
}

function testerPostSeed(tester: Account) {
  const seed = TESTER_POSTS[TESTERS.indexOf(tester)];
  if (seed === undefined) throw new Error(`No forum post written for ${tester.key}`);
  return seed;
}

function testerPostRow(tester: Account): PostRow {
  const seed = testerPostSeed(tester);
  return {
    id: ids.testerPost(tester),
    category: seed.category,
    author: tester,
    content: seed.content,
    imageKey: null,
    pinned: false,
    at: `(now() - interval '${TESTER_POST_DAYS_AGO} days')`,
  };
}

function testerReplyRows(tester: Account): ReplyRow[] {
  return testerPostSeed(tester).replies.map((reply: ReplySeed) => ({
    id: ids.testerReply(tester, reply.key),
    postId: ids.testerPost(tester),
    author: author(reply.author),
    content: reply.content,
    at: moment(reply),
  }));
}

// --- Gallery -----------------------------------------------------------------------------------

function gallerySql(): string {
  const values = GALLERY_ITEMS.map((item) => {
    const uploader = author(item.author);
    const at = moment(item);
    return (
      `  (${uid(ids.gallery(item.image))}, ${ORG}, ${uid(uploader.key)}, ${lit(uploader.firstName)}, ` +
      `${img(item.image)}, ${img(item.image)}, 'image', ${img(item.image, 'bytes')}, ${lit(item.caption)}, ` +
      `'community', 'visible', ${at}, ${lit(GALLERY_CONSENT_VERSION)}, ${at}, ${at})`
    );
  });
  return [
    'insert into public.media_items',
    '  (id, org_id, uploaded_by, uploader_first_name, file_url, thumbnail_url, file_type, file_size, caption,',
    '   privacy_level, moderation_state, consent_acknowledged_at, consent_version, created_at, updated_at)',
    'values',
    values.join(',\n'),
    'on conflict (id) do nothing;',
  ].join('\n');
}

// --- Stories -----------------------------------------------------------------------------------

function storyCategorySql(): string {
  return [
    'insert into public.knowledge_categories (id, org_id, name, slug, icon, sort_order)',
    `values (${uid(ids.storyCategory())}, ${ORG}, ${jsonb(STORY_CATEGORY.name)}, ${lit(STORY_CATEGORY.slug)}, ` +
      `${lit(STORY_CATEGORY.icon)}, ${STORY_CATEGORY.sortOrder})`,
    'on conflict (id) do nothing;',
  ].join('\n');
}

function storyBody(paragraphs: Readonly<Record<keyof Translated, readonly string[]>>): unknown {
  return Object.fromEntries(
    Object.entries(paragraphs).map(([language, texts]) => [
      language,
      texts.map((text) => ({ type: 'paragraph', text })),
    ]),
  );
}

function storiesSql(): string {
  // Each story went the player's way: she wrote it in her language and agreed
  // to publish it, then the team member translated it, approved it and
  // published it, which is what `reviewed_by` and `reviewed_at` record.
  const values = STORIES.map((story) => {
    const writer = author(story.author);
    const published = moment(story);
    const written = `(${published} - interval '2 days')`;
    return (
      `  (${uid(ids.story(story.key))}, ${ORG}, ${uid(ids.storyCategory())}, ${jsonb(story.title)}, ` +
      `${jsonb(storyBody(story.paragraphs))}, ${img(story.image)}, 'participant_story', 'published', ` +
      `${uid(writer.key)}, ${lit(writer.firstName)}, ${uid(TEAM.key)}, ${published}, true, ${published}, ` +
      `${uid(writer.key)}, ${written}, ${published}, ${lit(story.language)}, true, ${written}, ` +
      `${lit(STORY_CONSENT_VERSION)})`
    );
  });
  return [
    'insert into public.knowledge_articles',
    '  (id, org_id, category_id, title, body, image_url, content_type, story_status,',
    '   author_id, author_first_name, reviewed_by, reviewed_at, is_published, published_at,',
    '   created_by, created_at, updated_at, submission_language, publication_consent,',
    '   publication_consent_at, publication_consent_version)',
    'values',
    values.join(',\n'),
    'on conflict (id) do nothing;',
  ].join('\n');
}

// --- The module --------------------------------------------------------------------------------

function publish(): string {
  return [
    `-- ${MODULE}: forum categories, posts and replies, gallery, stories`,
    forumCategoriesSql(),
    postsSql([...companionPostRows(), ...TESTERS.map(testerPostRow)]),
    repliesSql([...companionReplyRows(), ...TESTERS.flatMap(testerReplyRows)]),
    gallerySql(),
    storyCategorySql(),
    storiesSql(),
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

function remove(): string {
  // Deleting a post deletes every reply on it, a tester's included, with its
  // reports and read records. A category goes only when nothing else sits in
  // it: a post a tester wrote herself stays, and keeps its category.
  return [
    `-- ${MODULE}: remove`,
    `delete from public.forum_posts where id in (${uuidList(postSlugs)});`,
    `delete from public.media_items where id in (${uuidList(gallerySlugs)});`,
    `delete from public.knowledge_articles where id in (${uuidList(storySlugs)});`,
    `delete from public.forum_categories as category where category.id in (${uuidList(forumCategorySlugs)})`,
    '  and not exists (select 1 from public.forum_posts as post where post.category_id = category.id);',
    `delete from public.knowledge_categories as category where category.id = ${uid(ids.storyCategory())}`,
    '  and not exists (select 1 from public.knowledge_articles as article where article.category_id = category.id);',
  ].join('\n');
}

function renew(tester: Account): string {
  // The runner clears her read and visit records, which makes every post,
  // photo and story new again. What else waits for her is her own post with
  // its three new replies: it comes back as published, visible and unedited.
  const post = testerPostRow(tester);
  const replies = testerReplyRows(tester);
  return [
    `-- ${MODULE}: renew ${tester.key}`,
    postsSql([post]),
    repliesSql(replies),
    `update public.forum_posts set visibility = 'visible', content = ${lit(post.content)}, image_url = null`,
    `  where id = ${uid(post.id)};`,
    ...replies.map(
      (reply) =>
        `update public.forum_replies set visibility = 'visible', content = ${lit(reply.content)} where id = ${uid(reply.id)};`,
    ),
  ].join('\n');
}

const comunitat: GroundModule = { name: MODULE, order: 40, publish, remove, renew };
export default comunitat;
