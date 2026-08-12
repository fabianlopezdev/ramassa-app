import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useWebConversation } from '@/lib/messaging';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MESSAGE_CONTENT_MAX_LENGTH } from '@ramassa/shared/messaging';

const WebMessageComposer = memo(function WebMessageComposer({
  send,
  sendState,
  sendErrorCode,
}: {
  readonly send: (content: string) => Promise<boolean | undefined>;
  readonly sendState: 'idle' | 'sending' | 'error';
  readonly sendErrorCode: string | null;
}) {
  const { t } = useTranslation('messaging');
  const { t: tErrors } = useTranslation('errors');
  const [draft, setDraft] = useState('');
  const submit = async () => {
    const content = draft.trim();
    if (content.length === 0) return;
    if (await send(content)) {
      setDraft((current) => (current.trim() === content ? '' : current));
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {sendState === 'error' ? (
        <p data-testid="message-send-error" role="alert" className="text-sm text-destructive">
          {t('sendError')}
          {sendErrorCode === null ? null : (
            <span className="block text-xs text-muted-foreground">
              {tErrors('errorCodeLabel')}: {sendErrorCode}
            </span>
          )}
        </p>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Textarea
          value={draft}
          data-testid="message-composer"
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('composerPlaceholder')}
          aria-label={t('composerPlaceholder')}
          maxLength={MESSAGE_CONTENT_MAX_LENGTH}
          rows={2}
          className="min-h-12 resize-none"
        />
        <Button
          data-testid="message-send"
          type="submit"
          size="lg"
          disabled={draft.trim().length === 0 || sendState === 'sending'}
        >
          {t(sendState === 'sending' ? 'sending' : 'send')}
        </Button>
      </form>
    </div>
  );
});

function WebMessageThread({
  conversationId,
  titleKey,
}: {
  readonly conversationId?: string;
  readonly titleKey: 'entityTitle' | 'staffTitle';
}) {
  const { t, i18n } = useTranslation('messaging');
  const { t: tErrors } = useTranslation('errors');
  const { peer, messages, state, sendState, loadErrorCode, sendErrorCode, load, send, userId } =
    useWebConversation(conversationId);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.resolvedLanguage],
  );

  return (
    <main
      data-testid="message-thread"
      className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-4xl flex-col px-4 py-5 sm:px-6"
    >
      <header className="mb-4 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {peer === null
            ? t(titleKey)
            : t('conversationWith', { name: `${peer.firstName} ${peer.lastName}` })}
        </h1>
      </header>
      {state === 'loading' ? (
        <p className="m-auto text-sm text-muted-foreground" aria-live="polite">
          {t('loadingConversation')}
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="m-auto flex flex-col items-center gap-3" role="alert">
          <p className="text-sm text-muted-foreground">{t('loadError')}</p>
          {loadErrorCode === null ? null : (
            <p className="text-xs text-muted-foreground">
              {tErrors('errorCodeLabel')}: {loadErrorCode}
            </p>
          )}
          <Button type="button" onClick={() => void load()}>
            {t('retry')}
          </Button>
        </div>
      ) : null}
      {state === 'ready' ? (
        <>
          <section
            className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-muted/30 p-4"
            aria-label={t(titleKey)}
          >
            {messages.length === 0 ? (
              <div className="grid h-full place-content-center gap-1 text-center">
                <p className="font-medium">{t('emptyTitle')}</p>
                <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {messages.map((message) => {
                  const isOwn = message.senderId === userId;
                  return (
                    <li
                      data-testid="message-row"
                      key={message.id}
                      className={`max-w-[var(--ramassa-messaging-message-bubble-max-width)] ${isOwn ? 'self-end' : 'self-start'}`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-2 ${isOwn ? 'rounded-ee-sm bg-primary text-primary-foreground' : 'rounded-es-sm border border-border bg-background'}`}
                      >
                        <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                      </div>
                      <p
                        className={`mt-1 text-xs text-muted-foreground ${isOwn ? 'text-end' : 'text-start'}`}
                      >
                        {formatter.format(new Date(message.createdAt))}
                        {isOwn ? ` · ${t(message.deliveryState)}` : ''}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          <WebMessageComposer send={send} sendState={sendState} sendErrorCode={sendErrorCode} />
        </>
      ) : null}
    </main>
  );
}

export function StaffWebMessageThread({ conversationId }: { readonly conversationId: string }) {
  return <WebMessageThread conversationId={conversationId} titleKey="staffTitle" />;
}

export function EntityWebMessageThread() {
  return <WebMessageThread titleKey="entityTitle" />;
}
