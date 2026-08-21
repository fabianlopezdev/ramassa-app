import { AuthenticatedMediaImage } from '@/components/content/authenticated-media-image';
import { adminClientEnv, supabase } from '@/lib/supabase';
import { Link, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  transitionFeedbackSubmission,
  type FeedbackMonthlyCount,
  type FeedbackStatus,
  type FeedbackType,
  type StaffFeedbackSubmission,
} from '@ramassa/shared/feedback';

const typeKey: Readonly<Record<FeedbackType, string>> = {
  activity_proposal: 'typeActivityProposal',
  idea: 'typeIdea',
  problem: 'typeProblem',
  general: 'typeGeneral',
};
const statusKey: Readonly<Record<FeedbackStatus, string>> = {
  new: 'statusNew',
  read: 'statusRead',
  in_progress: 'statusInProgress',
  resolved: 'statusResolved',
};

function nextStatuses(status: FeedbackStatus): readonly Exclude<FeedbackStatus, 'new'>[] {
  if (status === 'new') return ['read', 'in_progress', 'resolved'];
  if (status === 'read') return ['in_progress', 'resolved'];
  if (status === 'in_progress') return ['resolved'];
  return [];
}

export function StaffFeedbackInbox({
  submissions,
  monthlyCounts,
}: {
  readonly submissions: readonly StaffFeedbackSubmission[];
  readonly monthlyCounts: readonly FeedbackMonthlyCount[];
}) {
  const { t, i18n } = useTranslation('feedback');
  const { session } = useAuth();
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<'all' | FeedbackType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackStatus>('all');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const visible = useMemo(
    () =>
      submissions.filter(
        (submission) =>
          (typeFilter === 'all' || submission.type === typeFilter) &&
          (statusFilter === 'all' || submission.status === statusFilter),
      ),
    [statusFilter, submissions, typeFilter],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.resolvedLanguage],
  );

  async function transition(submissionId: string, status: Exclude<FeedbackStatus, 'new'>) {
    setPendingId(submissionId);
    setErrorCode(null);
    try {
      await transitionFeedbackSubmission(supabase, { submissionId, status });
      await router.invalidate();
    } catch (error) {
      setErrorCode(toAppError(error).code);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-neutral-950">{t('inboxTitle')}</h1>
        <p className="text-neutral-600">{t('inboxIntro')}</p>
      </header>

      <section aria-labelledby="feedback-monthly" className="space-y-3">
        <h2 id="feedback-monthly" className="text-lg font-semibold">
          {t('monthlyTitle')}
        </h2>
        <div
          data-testid="feedback-monthly-counts"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {monthlyCounts.slice(0, 8).map((item) => (
            <div
              key={`${item.month}-${item.type}`}
              className="rounded-xl border border-neutral-200 bg-white p-4"
            >
              <p className="text-sm text-neutral-500">{item.month}</p>
              <p className="font-medium text-neutral-800">{t(typeKey[item.type])}</p>
              <p className="text-2xl font-bold text-primary">{item.count}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label={t('inboxTitle')} className="space-y-4">
        <div className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-neutral-800">
            {t('filterType')}
            <select
              data-testid="feedback-type-filter"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as 'all' | FeedbackType)}
              className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3"
            >
              <option value="all">{t('filterAll')}</option>
              {FEEDBACK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(typeKey[type])}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-neutral-800">
            {t('filterStatus')}
            <select
              data-testid="feedback-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | FeedbackStatus)}
              className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3"
            >
              <option value="all">{t('filterAll')}</option>
              {FEEDBACK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(statusKey[status])}
                </option>
              ))}
            </select>
          </label>
        </div>
        {errorCode === null ? null : (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
            {errorCode}
          </p>
        )}
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-600">
            {t('inboxEmpty')}
          </p>
        ) : null}
        <ol data-testid="feedback-inbox" className="grid gap-4 lg:grid-cols-2">
          {visible.map((submission) => (
            <li
              key={submission.id}
              data-testid={`feedback-row-${submission.id}`}
              className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-neutral-950">
                    {submission.authorFirstName} {submission.authorLastName}
                  </h2>
                  <p className="text-sm text-neutral-500">
                    {dateFormatter.format(new Date(submission.createdAt))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-neutral-800">
                    {t(typeKey[submission.type])}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
                    {t(statusKey[submission.status])}
                  </span>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-neutral-800">{submission.content}</p>
              {submission.imageObjectKey === null ||
              adminClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL === undefined ? null : (
                <AuthenticatedMediaImage
                  objectKeyOrUrl={submission.imageObjectKey}
                  mediaWorkerUrl={adminClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL}
                  accessToken={session?.access_token}
                  alt={t(typeKey[submission.type])}
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              )}
              <div className="flex flex-wrap gap-2">
                {nextStatuses(submission.status).map((status) => (
                  <button
                    key={status}
                    type="button"
                    data-testid={`feedback-${status}-${submission.id}`}
                    disabled={pendingId === submission.id}
                    onClick={() => void transition(submission.id, status)}
                    className="min-h-11 rounded-lg border border-neutral-300 px-3 text-sm font-semibold text-neutral-800 disabled:opacity-50"
                  >
                    {status === 'read'
                      ? t('markRead')
                      : status === 'in_progress'
                        ? t('markInProgress')
                        : t('markResolved')}
                  </button>
                ))}
                <Link
                  data-testid={`feedback-chat-${submission.id}`}
                  to="/messages/$conversationId"
                  params={{ conversationId: submission.conversationId }}
                  className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white"
                >
                  {t('respondChat')}
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
