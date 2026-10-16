/**
 * Gallery moderation on the web admin (RAPP-387), for `gallery.moderate`
 * holders, as the phone's screen (RAPP-381): every gallery photo and video,
 * newest first, also hidden ones, filtered by All, Visible or Hidden (hidden
 * includes hidden until reviewed). Hide and Show again close the item's open
 * reports and are audited; Remove asks first and deletes the item and its
 * files through the media Worker. Reported items also show in forum
 * moderation.
 */
import { AuthenticatedMediaImage } from '@/components/content/authenticated-media-image';
import { adminClientEnv, supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import { AppError, toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  filterGallery,
  GALLERY_FILTERS,
  setMediaItemModeration,
  type GalleryFilter,
  type MediaItemRow,
} from '@ramassa/shared/media';
import { deleteMediaItem } from '@ramassa/shared/upload-client';

const FILTER_KEYS: Readonly<Record<GalleryFilter, string>> = {
  all: 'filterAll',
  visible: 'filterVisible',
  hidden: 'filterHidden',
};

const actionClass =
  'min-h-11 rounded-lg border border-neutral-300 px-3 text-sm font-semibold text-neutral-800 disabled:opacity-50';

export function GalleryModeration({ items }: { readonly items: readonly MediaItemRow[] }) {
  const { t, i18n } = useTranslation('gallery');
  const { session } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const visible = useMemo(() => filterGallery(items, filter), [filter, items]);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Madrid',
      }),
    [i18n.resolvedLanguage],
  );
  const mediaWorkerUrl = adminClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;

  async function run(itemId: string, action: () => Promise<void>) {
    setPendingId(itemId);
    setErrorCode(null);
    try {
      await action();
      await router.invalidate();
    } catch (error) {
      setErrorCode(toAppError(error).code);
    } finally {
      setPendingId(null);
    }
  }

  function remove(item: MediaItemRow) {
    if (!window.confirm(`${t('deleteTitle')}\n${t('deleteBody')}`)) return;
    void run(item.id, async () => {
      if (session === null || mediaWorkerUrl === undefined) throw new AppError('AUTH-2');
      const result = await deleteMediaItem({
        mediaWorkerUrl,
        accessToken: session.access_token,
        mediaItemId: item.id,
      });
      if (!result.ok) throw result.error;
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-neutral-950">{t('moderationTitle')}</h1>
        <p className="text-neutral-600">{t('moderationIntro')}</p>
      </header>

      <section aria-label={t('moderationTitle')} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" className="flex flex-wrap gap-2">
            {GALLERY_FILTERS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                data-testid={`gallery-filter-${candidate}`}
                aria-pressed={candidate === filter}
                onClick={() => setFilter(candidate)}
                className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${
                  candidate === filter
                    ? 'border-primary bg-primary text-white'
                    : 'border-neutral-300 bg-white text-neutral-800'
                }`}
              >
                {t(FILTER_KEYS[candidate])}
              </button>
            ))}
          </div>
          <p data-testid="gallery-total" className="text-sm text-neutral-600 tabular-nums">
            {t('moderationTotal', { count: visible.length })}
          </p>
        </div>
        {errorCode === null ? null : (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
            {t('moderationFailed')} {errorCode}
          </p>
        )}
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-600">
            {t('empty')}
          </p>
        ) : null}
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const isVisible = item.moderation_state === 'visible';
            const preview =
              item.thumbnail_url ?? (item.file_type === 'image' ? item.file_url : null);
            return (
              <li
                key={item.id}
                data-testid={`gallery-item-${item.id}`}
                className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                {/* A fixed frame, so the card keeps its shape while the photo loads. */}
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-sm font-semibold text-neutral-600">
                  {preview === null || mediaWorkerUrl === undefined ? (
                    t('moderationVideo')
                  ) : (
                    <AuthenticatedMediaImage
                      objectKeyOrUrl={preview}
                      mediaWorkerUrl={mediaWorkerUrl}
                      accessToken={session?.access_token}
                      alt={item.caption ?? t('mediaBy', { name: item.uploader_first_name })}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-neutral-950">
                    {t('mediaBy', { name: item.uploader_first_name })}
                  </p>
                  <p className="text-neutral-500">
                    {dateFormatter.format(new Date(item.created_at))}
                  </p>
                  {item.caption === null ? null : (
                    <p className="whitespace-pre-wrap text-neutral-800" dir="auto">
                      {item.caption}
                    </p>
                  )}
                  <p className="text-neutral-600">
                    {`${t('privacy')} ${t(`privacyLevels.${item.privacy_level}`)}`}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    {isVisible ? null : (
                      <span
                        data-testid={`gallery-state-${item.id}`}
                        className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700"
                      >
                        {item.moderation_state === 'hidden' ? t('stateHidden') : t('statePending')}
                      </span>
                    )}
                    {item.flag_count === 0 ? null : (
                      <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
                        {t('moderationReports', { count: item.flag_count })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid={isVisible ? `gallery-hide-${item.id}` : `gallery-show-${item.id}`}
                    disabled={pendingId === item.id}
                    onClick={() =>
                      void run(item.id, () =>
                        setMediaItemModeration(supabase, item.id, isVisible ? 'hidden' : 'visible'),
                      )
                    }
                    className={actionClass}
                  >
                    {isVisible ? t('moderationHide') : t('moderationShow')}
                  </button>
                  <button
                    type="button"
                    data-testid={`gallery-remove-${item.id}`}
                    disabled={pendingId === item.id}
                    onClick={() => remove(item)}
                    className="min-h-11 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:opacity-50"
                  >
                    {t('delete')}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
