import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  addEntityServiceComment,
  type ServiceSubmissionComment,
} from '@ramassa/shared/services/entity';

interface EntityServiceThreadProps {
  readonly serviceId: string;
  readonly initialComments: readonly ServiceSubmissionComment[];
}

export function EntityServiceThread({ serviceId, initialComments }: EntityServiceThreadProps) {
  const { t, i18n } = useTranslation(['entity-services', 'errors']);
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    setIsSending(true);
    const result = await safeAsync(() => addEntityServiceComment(supabase, serviceId, body), {
      context: { operation: 'entity-service-comment' },
    });
    setIsSending(false);
    if (!result.ok) setErrorCode(result.error.code);
    else {
      setComments((current) => [...current, result.value]);
      setBody('');
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby="service-comments-title">
      <h2 id="service-comments-title" className="text-lg font-semibold">
        {t('entity-services:commentsTitle')}
      </h2>
      {comments.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('entity-services:commentsEmpty')}</p>
      ) : (
        <ol className="mt-4 grid gap-3" data-testid="entity-service-comments">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg bg-muted p-3">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {t(
                    comment.authorRole === 'entity'
                      ? 'entity-services:commentEntity'
                      : 'entity-services:commentStaff',
                  )}
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
          <span className="sr-only">{t('entity-services:commentsPlaceholder')}</span>
          <Textarea
            required
            maxLength={4_000}
            value={body}
            data-testid="entity-service-comment-body"
            placeholder={t('entity-services:commentsPlaceholder')}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        {errorCode === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors:${errorCode}`)}
          </p>
        )}
        <Button
          type="submit"
          className="justify-self-start"
          disabled={isSending || body.trim().length === 0}
          data-testid="entity-service-comment-send"
        >
          {isSending ? t('entity-services:commentsSending') : t('entity-services:commentsSend')}
        </Button>
      </form>
    </section>
  );
}
