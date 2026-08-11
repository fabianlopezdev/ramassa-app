import { StaffWebMessageThread } from '@/components/messaging/web-message-thread';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { getRouteApi, Link, useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import {
  setConversationAssignment,
  subscribeToConversationQueue,
  type AdminConversationSearch,
  type Conversation,
  type ConversationAssignmentHistoryEntry,
  type ConversationPeer,
  type ConversationStaffMember,
} from '@ramassa/shared/messaging';

const messagesRoute = getRouteApi('/_staff/messages');
const SEARCH_DEBOUNCE_MS = 300;

export function StaffConversationManager({ detail }: { readonly detail: ReactNode }) {
  const { t, i18n } = useTranslation('messaging');
  const { user } = useAuth();
  const router = useRouter();
  const navigate = useNavigate({ from: '/messages' });
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = messagesRoute.useSearch();
  const { conversations } = messagesRoute.useLoaderData();
  const [draftQuery, setDraftQuery] = useState(search.q);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    [i18n.resolvedLanguage],
  );

  useEffect(() => setDraftQuery(search.q), [search.q]);
  useEffect(() => {
    if (draftQuery === search.q) return;
    const timer = setTimeout(() => {
      void navigate({ search: (previous) => ({ ...previous, q: draftQuery }) });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftQuery, navigate, search.q]);
  useEffect(() => {
    if (user === null) return;
    return subscribeToConversationQueue(supabase, user.id, () => void router.invalidate());
  }, [router, user]);

  const updateSearch = (next: Partial<AdminConversationSearch>) => {
    void navigate({ search: (previous) => ({ ...previous, ...next }) });
  };

  return (
    <section className="grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 md:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="flex max-h-[42dvh] min-h-0 flex-col border-b border-border md:max-h-none md:border-e md:border-b-0">
        <header className="space-y-3 border-b border-border p-4">
          <div>
            <h1 className="text-xl font-semibold">{t('managementTitle')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('conversationCount', { count: conversations.length })}
            </p>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('searchLabel')}</span>
            <Input
              data-testid="conversation-search"
              type="search"
              value={draftQuery}
              maxLength={200}
              placeholder={t('searchPlaceholder')}
              onChange={(event) => setDraftQuery(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <FilterToggle
              label={t('filterUnread')}
              checked={search.unread}
              testId="conversation-filter-unread"
              onChange={(unread) => updateSearch({ unread })}
            />
            <FilterToggle
              label={t('filterAssignedToMe')}
              checked={search.assigned}
              testId="conversation-filter-assigned"
              onChange={(assigned) => updateSearch({ assigned })}
            />
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('filterParticipant')}</span>
            <select
              data-testid="conversation-filter-participant"
              value={search.participant}
              onChange={(event) =>
                updateSearch({
                  participant: event.target.value as AdminConversationSearch['participant'],
                })
              }
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">{t('participantAll')}</option>
              <option value="player">{t('participantPlayer')}</option>
              <option value="entity">{t('participantEntity')}</option>
            </select>
          </label>
        </header>

        <div data-testid="conversation-list" className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div data-testid="conversation-list-empty" className="space-y-2 p-6 text-center">
              <p className="font-medium">{t('noConversationsTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('noConversationsBody')}</p>
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {conversations.map((conversation) => {
                const to = `/messages/${conversation.conversationId}`;
                const isActive = pathname === to;
                const name = `${conversation.participantFirstName} ${conversation.participantLastName}`;
                return (
                  <li key={conversation.conversationId}>
                    <Link
                      data-conversation-row="true"
                      data-testid={`conversation-row-${conversation.conversationId}`}
                      to="/messages/$conversationId"
                      params={{ conversationId: conversation.conversationId }}
                      search={search}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'block space-y-2 p-4 transition-colors hover:bg-muted/60',
                        isActive && 'bg-muted',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{name}</span>
                        {conversation.unreadCount > 0 ? (
                          <Badge data-testid="conversation-unread-badge">
                            {conversation.unreadCount}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">
                          {t(`participant${capitalize(conversation.participantRole)}`)}
                        </Badge>
                        {conversation.assignedStaffId === null ? (
                          <Badge variant="secondary">{t('unassigned')}</Badge>
                        ) : (
                          <Badge variant="secondary" data-testid="conversation-assignee">
                            {`${conversation.assignedStaffFirstName ?? ''} ${conversation.assignedStaffLastName ?? ''}`.trim()}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {conversation.latestMessagePreview ?? t('noMessagePreview')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatter.format(
                          new Date(
                            conversation.latestMessageAt ?? conversation.conversationCreatedAt,
                          ),
                        )}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
      <div className="min-w-0">{detail}</div>
    </section>
  );
}

function FilterToggle({
  label,
  checked,
  testId,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly testId: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-md border border-input px-3 text-sm">
      <input
        data-testid={testId}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function StaffConversationDetail({
  conversationId,
  conversation,
  peer,
  history,
}: {
  readonly conversationId: string;
  readonly conversation: Conversation;
  readonly peer: ConversationPeer;
  readonly history: readonly ConversationAssignmentHistoryEntry[];
}) {
  const { t, i18n } = useTranslation('messaging');
  const router = useRouter();
  const { staff } = messagesRoute.useLoaderData();
  const [isSaving, setIsSaving] = useState(false);
  const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff]);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.resolvedLanguage],
  );

  const assign = async (staffId: string | null) => {
    setIsSaving(true);
    try {
      await setConversationAssignment(supabase, conversationId, staffId);
      await router.invalidate();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <StaffWebMessageThread conversationId={conversationId} />
      <aside
        data-testid="conversation-context"
        className="space-y-6 border-t border-border p-5 xl:border-s xl:border-t-0"
      >
        <section className="space-y-2">
          <h2 className="font-semibold">{t('participantContext')}</h2>
          <p className="text-lg font-medium">{`${peer.firstName} ${peer.lastName}`}</p>
          <p className="text-sm text-muted-foreground">
            {t(`participant${capitalize(peer.role)}`)}
          </p>
          {peer.city === null ? null : (
            <p
              data-testid="conversation-participant-city"
              className="text-sm text-muted-foreground"
            >
              {peer.city}
            </p>
          )}
          <p
            data-testid="conversation-participant-language"
            className="text-sm text-muted-foreground"
          >
            {peer.preferredLanguage.toUpperCase()}
          </p>
          {peer.role === 'player' ? (
            <Link
              data-testid="conversation-participant-link"
              to="/participants/$participantId"
              params={{ participantId: peer.id }}
              className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('openParticipant')}
            </Link>
          ) : null}
        </section>

        <section className="space-y-2">
          <label className="block space-y-1">
            <span className="text-sm font-semibold">{t('assignmentLabel')}</span>
            <select
              data-testid="conversation-assignment"
              value={conversation.assignedStaffId ?? ''}
              disabled={isSaving}
              onChange={(event) =>
                void assign(event.target.value === '' ? null : event.target.value)
              }
              className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <option value="">{t('unassigned')}</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {staffName(member)}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t('assignmentHistory')}</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('assignmentHistoryEmpty')}</p>
          ) : (
            <ol data-testid="assignment-history" className="space-y-3">
              {history.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <p>{assignmentDescription(entry, staffById, t)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatter.format(new Date(entry.createdAt))}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}

function staffName(member: ConversationStaffMember): string {
  return `${member.firstName} ${member.lastName}`;
}

function assignmentDescription(
  entry: ConversationAssignmentHistoryEntry,
  staffById: ReadonlyMap<string, ConversationStaffMember>,
  t: TFunction<'messaging'>,
): string {
  const actor = staffById.get(entry.changedBy);
  const assigned = entry.assignedStaffId === null ? null : staffById.get(entry.assignedStaffId);
  return assigned === null || assigned === undefined
    ? t('historyUnassigned', { actor: actor === undefined ? t('unknownStaff') : staffName(actor) })
    : t('historyAssigned', {
        actor: actor === undefined ? t('unknownStaff') : staffName(actor),
        assignee: staffName(assigned),
      });
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
