import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useWebConversation } from '@/lib/messaging';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

function WebMessageThread({
  conversationId,
  titleKey,
}: {
  readonly conversationId?: string;
  readonly titleKey: 'entityTitle' | 'staffTitle';
}) {
  const { t, i18n } = useTranslation('messaging');
  const { peer, messages, state, load, send, userId } = useWebConversation(conversationId);
  const [draft, setDraft] = useState('');
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.resolvedLanguage],
  );
  const submit = () => {
    const content = draft.trim();
    if (content.length === 0) return;
    setDraft('');
    void send(content);
  };

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
          {t('sending')}
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="m-auto flex flex-col items-center gap-3" role="alert">
          <p className="text-sm text-muted-foreground">{t('loadError')}</p>
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
                      className={`max-w-[82%] ${isOwn ? 'self-end' : 'self-start'}`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-2 ${isOwn ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border border-border bg-background'}`}
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
          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Textarea
              value={draft}
              data-testid="message-composer"
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('composerPlaceholder')}
              aria-label={t('composerPlaceholder')}
              maxLength={4_000}
              rows={2}
              className="min-h-12 resize-none"
            />
            <Button
              data-testid="message-send"
              type="submit"
              size="lg"
              disabled={draft.trim().length === 0}
            >
              {t('send')}
            </Button>
          </form>
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
