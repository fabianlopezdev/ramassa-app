import { ServiceSubmissionApprovalEditor } from '@/components/content/service-editor';
import { ServiceReviewThread } from '@/components/content/service-review-thread';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  diffServiceSnapshots,
  markServiceReviewNotificationRead,
  rejectEntityService,
  type AdminServiceCategory,
  type AdminServiceDetail,
  type ServiceReviewNotification,
} from '@ramassa/shared/services';
import type { ServiceSubmissionComment } from '@ramassa/shared/services/entity';

interface ServiceReviewDetailProps {
  readonly detail: AdminServiceDetail;
  readonly categories: readonly AdminServiceCategory[];
  readonly comments: readonly ServiceSubmissionComment[];
  readonly notification: ServiceReviewNotification | null;
}

export function ServiceReviewDetail({
  detail,
  categories,
  comments,
  notification,
}: ServiceReviewDetailProps) {
  return notification === null ? (
    <PendingServiceReview detail={detail} categories={categories} comments={comments} />
  ) : (
    <PublishedEditReview detail={detail} comments={comments} notification={notification} />
  );
}

function ReviewHeader({ title }: { readonly title: string }) {
  const { t } = useTranslation('services');
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 p-6 pb-0">
      <div>
        <p className="text-sm text-muted-foreground">{t('reviewDetailEyebrow')}</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <Button asChild variant="outline">
        <Link to="/content/services/reviews">{t('reviewBackToQueue')}</Link>
      </Button>
    </header>
  );
}

function PendingServiceReview({
  detail,
  categories,
  comments,
}: Omit<ServiceReviewDetailProps, 'notification'>) {
  const { t } = useTranslation(['services', 'errors']);
  const navigate = useNavigate();
  const router = useRouter();
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectionComment, setRejectionComment] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  async function reject() {
    setErrorCode(null);
    setIsRejecting(true);
    const result = await safeAsync(
      () => rejectEntityService(supabase, detail.service.id, rejectionComment),
      { context: { operation: 'reject-service-submission' } },
    );
    setIsRejecting(false);
    if (!result.ok) setErrorCode(result.error.code);
    else {
      await router.invalidate({ sync: true });
      await navigate({ to: '/content/services/reviews' });
    }
  }

  return (
    <section>
      <ReviewHeader title={detail.service.title.ca} />
      <div className="mx-6 mt-6 grid gap-6 rounded-xl border bg-card p-5">
        <label className="grid gap-2">
          <span className="font-medium">{t('services:reviewApprovalComment')}</span>
          <Textarea
            maxLength={4_000}
            value={approvalComment}
            data-testid="service-review-approval-comment"
            placeholder={t('services:reviewApprovalCommentHelp')}
            onChange={(event) => setApprovalComment(event.target.value)}
          />
        </label>
      </div>
      <ServiceSubmissionApprovalEditor
        detail={detail}
        categories={categories}
        publicComment={approvalComment}
        onApproved={async () => {
          await router.invalidate({ sync: true });
          await navigate({ to: '/content/services/reviews' });
        }}
      />
      <div className="mx-6 mb-6 grid gap-3 rounded-xl border border-destructive/30 p-5">
        <h2 className="text-lg font-semibold">{t('services:reviewRejectTitle')}</h2>
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t('services:reviewRejectComment')}</span>
          <Textarea
            required
            maxLength={4_000}
            value={rejectionComment}
            data-testid="service-review-rejection-comment"
            onChange={(event) => setRejectionComment(event.target.value)}
          />
        </label>
        {errorCode === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors:${errorCode}`)}
          </p>
        )}
        <Button
          type="button"
          variant="destructive"
          className="justify-self-start"
          disabled={isRejecting || rejectionComment.trim().length === 0}
          data-testid="service-review-reject"
          onClick={() => void reject()}
        >
          {isRejecting ? t('services:reviewRejecting') : t('services:reviewReject')}
        </Button>
      </div>
      <div className="p-6 pt-0">
        <ServiceReviewThread serviceId={detail.service.id} initialComments={comments} />
      </div>
    </section>
  );
}

function PublishedEditReview({
  detail,
  comments,
  notification,
}: Pick<ServiceReviewDetailProps, 'detail' | 'comments' | 'notification'> & {
  readonly notification: ServiceReviewNotification;
}) {
  const { t } = useTranslation(['services', 'errors']);
  const navigate = useNavigate();
  const [isMarking, setIsMarking] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const changes = diffServiceSnapshots(notification.previousService, notification.currentService);

  async function markReviewed() {
    setErrorCode(null);
    setIsMarking(true);
    const result = await safeAsync(
      () => markServiceReviewNotificationRead(supabase, notification.id),
      { context: { operation: 'mark-service-live-edit-reviewed' } },
    );
    setIsMarking(false);
    if (!result.ok) setErrorCode(result.error.code);
    else await navigate({ to: '/content/services/reviews' });
  }

  return (
    <section>
      <ReviewHeader title={detail.service.title.ca} />
      <div className="grid gap-6 p-6">
        <section className="rounded-xl border bg-card p-5" aria-labelledby="review-diff-title">
          <h2 id="review-diff-title" className="text-lg font-semibold">
            {t('services:reviewDiffTitle')}
          </h2>
          {changes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('services:reviewDiffEmpty')}</p>
          ) : (
            <dl className="mt-4 grid gap-4" data-testid="service-review-diff">
              {changes.map((change) => (
                <div key={change.field} className="grid gap-2 rounded-lg border p-4">
                  <dt className="font-medium">{change.field}</dt>
                  <dd className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        {t('services:reviewPrevious')}
                      </p>
                      <pre className="mt-1 overflow-auto whitespace-pre-wrap text-sm">
                        {JSON.stringify(change.previous, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        {t('services:reviewCurrent')}
                      </p>
                      <pre className="mt-1 overflow-auto whitespace-pre-wrap text-sm">
                        {JSON.stringify(change.current, null, 2)}
                      </pre>
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {errorCode === null ? null : (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {t(`errors:${errorCode}`)}
            </p>
          )}
          <Button
            type="button"
            className="mt-5"
            disabled={isMarking}
            data-testid="service-review-mark-reviewed"
            onClick={() => void markReviewed()}
          >
            {isMarking ? t('services:reviewMarking') : t('services:reviewMarkReviewed')}
          </Button>
        </section>
        <ServiceReviewThread serviceId={detail.service.id} initialComments={comments} />
      </div>
    </section>
  );
}
