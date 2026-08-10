import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  addStaffServiceComment,
  type ServiceSubmissionComment,
  type StaffServiceCommentVisibility,
} from '@ramassa/shared/services/entity';

interface ServiceReviewThreadProps {
  readonly serviceId: string;
  readonly initialComments: readonly ServiceSubmissionComment[];
}

export function ServiceReviewThread({ serviceId, initialComments }: ServiceReviewThreadProps) {
  const { t, i18n } = useTranslation(['services', 'errors']);
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<StaffServiceCommentVisibility>('public');
  const [isSending, setIsSending] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    setIsSending(true);
    const result = await safeAsync(
      () => addStaffServiceComment(supabase, serviceId, body, visibility),
      { context: { operation: 'staff-service-comment', visibility } },
    );
    setIsSending(false);
    if (!result.ok) setErrorCode(result.error.code);
    else {
      setComments((current) => [...current, result.value]);
      setBody('');
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby="review-thread-title">
      <h2 id="review-thread-title" className="text-lg font-semibold">
        {t('services:reviewThreadTitle')}
      </h2>
      {comments.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('services:reviewThreadEmpty')}</p>
      ) : (
        <ol className="mt-4 grid gap-3" data-testid="service-review-comments">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg bg-muted p-3">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {comment.isInternal
                    ? t('services:reviewCommentInternal')
                    : comment.authorRole === 'entity'
                      ? t('services:reviewCommentEntity')
                      : t('services:reviewCommentStaff')}
                </span>
                <time dateTime={comment.createdAt}>
                  {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(comment.createdAt))}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form className="mt-5 grid gap-3" onSubmit={(event) => void submit(event)}>
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t('services:reviewCommentVisibility')}</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={visibility}
            data-testid="service-review-comment-visibility"
            onChange={(event) => setVisibility(event.target.value as StaffServiceCommentVisibility)}
          >
            <option value="public">{t('services:reviewVisibilityPublic')}</option>
            <option value="internal">{t('services:reviewVisibilityInternal')}</option>
          </select>
        </label>
        <Textarea
          required
          maxLength={4_000}
          value={body}
          data-testid="service-review-comment-body"
          placeholder={t('services:reviewCommentPlaceholder')}
          onChange={(event) => setBody(event.target.value)}
        />
        {errorCode === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors:${errorCode}`)}
          </p>
        )}
        <Button
          type="submit"
          className="justify-self-start"
          disabled={isSending || body.trim().length === 0}
          data-testid="service-review-comment-send"
        >
          {isSending ? t('services:reviewCommentSending') : t('services:reviewCommentSend')}
        </Button>
      </form>
    </section>
  );
}
