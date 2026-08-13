import { AuthenticatedMediaImage } from '@/components/content/authenticated-media-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { safeAsync } from '@/lib/observability';
import { adminClientEnv, supabase } from '@/lib/supabase';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  contactForumAuthor,
  deleteForumCategory,
  moderateForumTarget,
  saveForumCategory,
  setForumPostCategory,
  setForumPostPinned,
  type ForumCategoryInput,
  type ForumCategoryRow,
  type ForumModerationAction,
  type ForumModerationQueueRow,
} from '@ramassa/shared/forum';
import { resolveLocalizedText } from '@ramassa/shared/i18n';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { deleteMediaItem } from '@ramassa/shared/upload-client';

export interface ForumModerationProps {
  readonly queue: readonly ForumModerationQueueRow[];
  readonly categories: readonly ForumCategoryRow[];
}

export function ForumModeration({ queue, categories }: ForumModerationProps) {
  const { t, i18n } = useTranslation('forum');
  const router = useRouter();
  const navigate = useNavigate();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    [i18n.resolvedLanguage],
  );
  const { session } = useAuth();

  async function run(key: string, operation: () => Promise<void>) {
    setBusyKey(key);
    setErrorMessage(null);
    const result = await safeAsync(operation);
    setBusyKey(null);
    if (!result.ok) {
      setErrorMessage(t('moderationActionFailed'));
      return;
    }
    await router.invalidate();
  }

  async function moderate(row: ForumModerationQueueRow, action: ForumModerationAction) {
    if (action === 'delete' && !window.confirm(t('moderationDeleteConfirm'))) return;
    if (row.target_type === 'media' && action === 'delete') {
      await run(`${row.target_id}:${action}`, async () => {
        if (session === null || adminClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL === undefined) {
          throw new AppError('AUTH-2');
        }
        const result = await deleteMediaItem({
          mediaWorkerUrl: adminClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
          accessToken: session.access_token,
          mediaItemId: row.target_id,
        });
        if (!result.ok) throw result.error;
      });
      return;
    }
    await run(`${row.target_id}:${action}`, () =>
      moderateForumTarget(supabase, {
        targetType: row.target_type,
        targetId: row.target_id,
        action,
      }),
    );
  }

  async function contact(row: ForumModerationQueueRow) {
    setBusyKey(`${row.target_id}:contact`);
    setErrorMessage(null);
    const result = await safeAsync(() => contactForumAuthor(supabase, row.author_id));
    setBusyKey(null);
    if (!result.ok) {
      setErrorMessage(t('moderationActionFailed'));
      return;
    }
    await navigate({
      to: '/messages/$conversationId',
      params: { conversationId: result.value },
      search: { assigned: false, participant: 'all', q: '', unread: false },
    });
  }

  return (
    <section className="flex flex-col gap-6 p-6">
      <header className="space-y-1">
        <h1 className="text-start text-2xl font-semibold">{t('moderationTitle')}</h1>
        <p className="text-start text-sm text-muted-foreground">
          {t('moderationCount', { count: queue.length })}
        </p>
      </header>
      {errorMessage === null ? null : (
        <p role="alert" className="text-start text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {queue.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="font-medium">{t('moderationEmptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('moderationEmptyBody')}</p>
        </div>
      ) : (
        <ol className="space-y-4">
          {queue.map((row) => {
            const category = categories.find((candidate) => candidate.id === row.category_id);
            const categoryLabel =
              category === undefined
                ? t('moderationUnknownCategory')
                : (resolveLocalizedText(category.name, i18n.resolvedLanguage as LanguageCode)
                    ?.text ?? category.slug);
            return (
              <li
                key={`${row.target_type}:${row.target_id}`}
                className="space-y-4 rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive">
                        {t('moderationFlags', { count: row.flag_count })}
                      </Badge>
                      <Badge variant="outline">{t(`moderationTarget.${row.target_type}`)}</Badge>
                      {row.target_type === 'media' ? null : (
                        <Badge variant="secondary">{categoryLabel}</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium">{row.author_first_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatter.format(new Date(row.first_flagged_at))}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      label={t('moderationDismiss')}
                      busy={busyKey === `${row.target_id}:dismiss`}
                      onClick={() => void moderate(row, 'dismiss')}
                    />
                    <ActionButton
                      label={t('moderationHide')}
                      busy={busyKey === `${row.target_id}:hide`}
                      onClick={() => void moderate(row, 'hide')}
                    />
                    <ActionButton
                      label={t('moderationDelete')}
                      busy={busyKey === `${row.target_id}:delete`}
                      destructive
                      onClick={() => void moderate(row, 'delete')}
                    />
                    <ActionButton
                      label={t('moderationContact')}
                      busy={busyKey === `${row.target_id}:contact`}
                      onClick={() => void contact(row)}
                    />
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-start text-sm">
                  {row.content ?? t('deletedTombstone')}
                </p>
                {row.target_type === 'media' && row.media_thumbnail_url !== null ? (
                  <AuthenticatedMediaImage
                    objectKeyOrUrl={row.media_thumbnail_url}
                    mediaWorkerUrl={adminClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL ?? ''}
                    accessToken={session?.access_token}
                    alt={row.content ?? t('moderationTarget.media')}
                    className="max-h-64 rounded-lg object-contain"
                  />
                ) : null}
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    {t('moderationReasons')}:{' '}
                    {row.reasons.map((reason) => t(`flagReasons.${reason}`)).join(', ')}
                  </p>
                  {row.comments.map((comment, index) => (
                    <blockquote
                      key={`${row.target_id}:comment:${index}`}
                      className="border-s-2 border-border ps-3"
                    >
                      {comment}
                    </blockquote>
                  ))}
                </div>
                {row.target_type === 'post' ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busyKey !== null}
                      onClick={() =>
                        void run(`${row.target_id}:pin`, () =>
                          setForumPostPinned(supabase, row.target_id, !row.is_pinned),
                        )
                      }
                    >
                      {row.is_pinned ? t('moderationUnpin') : t('moderationPin')}
                    </Button>
                    <label className="space-y-1 text-sm font-medium">
                      <span>{t('moderationCategory')}</span>
                      <select
                        value={row.category_id ?? ''}
                        disabled={busyKey !== null}
                        onChange={(event) =>
                          void run(`${row.target_id}:category`, () =>
                            setForumPostCategory(supabase, row.target_id, event.target.value),
                          )
                        }
                        className="block h-9 rounded-md border border-input bg-transparent px-3"
                      >
                        {categories.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {resolveLocalizedText(
                              candidate.name,
                              i18n.resolvedLanguage as LanguageCode,
                            )?.text ?? candidate.slug}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <ForumCategoryManager categories={categories} />
    </section>
  );
}

function ActionButton({
  label,
  busy,
  destructive = false,
  onClick,
}: {
  readonly label: string;
  readonly busy: boolean;
  readonly destructive?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={destructive ? 'destructive' : 'outline'}
      disabled={busy}
      onClick={onClick}
    >
      {busy ? `${label}…` : label}
    </Button>
  );
}

const emptyCategory = (): ForumCategoryInput => ({
  id: null,
  name: { ca: '', es: '', en: '', ar: '', fa: '' },
  slug: '',
  icon: 'message-circle',
  color: 'primary',
  sortOrder: 0,
});

export function ForumCategoryManager({
  categories,
}: {
  readonly categories: readonly ForumCategoryRow[];
}) {
  const { t } = useTranslation('forum');
  const router = useRouter();
  const [draft, setDraft] = useState<ForumCategoryInput>(emptyCategory);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    const result = await safeAsync(() => saveForumCategory(supabase, draft));
    setIsSaving(false);
    if (!result.ok) {
      setErrorMessage(t('categorySaveFailed'));
      return;
    }
    setDraft(emptyCategory());
    await router.invalidate();
  }

  function edit(category: ForumCategoryRow) {
    setDraft({
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
      sortOrder: category.sort_order,
    });
  }

  async function remove(categoryId: string) {
    if (!window.confirm(t('categoryDeleteConfirm'))) return;
    setErrorMessage(null);
    const result = await safeAsync(() => deleteForumCategory(supabase, categoryId));
    if (!result.ok) {
      setErrorMessage(t('categoryDeleteFailed'));
      return;
    }
    await router.invalidate();
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <h2 className="text-start text-xl font-semibold">{t('categoryManagerTitle')}</h2>
      <ul className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <li
            key={category.id}
            className="flex items-center gap-2 rounded-md border border-border p-2"
          >
            <span>{category.slug}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => edit(category)}>
              {t('categoryEdit')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void remove(category.id)}
            >
              {t('categoryDelete')}
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void submit(event)} className="grid gap-3 md:grid-cols-2">
        {(['ca', 'es', 'en', 'ar', 'fa'] as const).map((language) => (
          <label key={language} className="space-y-1 text-sm font-medium">
            <span>{t('categoryName', { language: language.toUpperCase() })}</span>
            <Input
              required
              value={draft.name[language]}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: { ...current.name, [language]: event.target.value },
                }))
              }
            />
          </label>
        ))}
        <CategoryField
          label={t('categorySlug')}
          value={draft.slug}
          onChange={(slug) => setDraft((current) => ({ ...current, slug }))}
        />
        <CategoryField
          label={t('categoryIcon')}
          value={draft.icon}
          onChange={(icon) => setDraft((current) => ({ ...current, icon }))}
        />
        <CategoryField
          label={t('categoryColor')}
          value={draft.color}
          onChange={(color) => setDraft((current) => ({ ...current, color }))}
        />
        <label className="space-y-1 text-sm font-medium">
          <span>{t('categorySortOrder')}</span>
          <Input
            type="number"
            required
            value={draft.sortOrder}
            onChange={(event) =>
              setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))
            }
          />
        </label>
        {errorMessage === null ? null : (
          <p role="alert" className="text-sm text-destructive md:col-span-2">
            {errorMessage}
          </p>
        )}
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" disabled={isSaving}>
            {draft.id === null ? t('categoryCreate') : t('categorySave')}
          </Button>
          {draft.id === null ? null : (
            <Button type="button" variant="outline" onClick={() => setDraft(emptyCategory())}>
              {t('cancel')}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function CategoryField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium">
      <span>{label}</span>
      <Input required value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
