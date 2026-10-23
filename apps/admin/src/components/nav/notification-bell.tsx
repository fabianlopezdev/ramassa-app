/**
 * The bell in the top bar (RAPP-640), built like the Studio Portal bell: her
 * unread count on the button, and a drawer from the end of the screen with
 * her latest notifications. A row is bold with a dot while unread; opening it
 * marks it read, closes the drawer and goes to its page. She deletes one with
 * its trash button or a selection with "Delete (n)"; deleted rows leave her
 * bell and are never erased.
 */
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  formatTimeAgo,
  useStaffNotifications,
  type StaffNotification,
} from '@/lib/staff-notifications';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { Bell, Trash2, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

function unreadBadge(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function NotificationBell() {
  const { t, i18n } = useTranslation('admin');
  const navigate = useNavigate();
  const { items, unread, status, markRead, remove } = useStaffNotifications();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const allId = useId();
  const now = new Date();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // The drawer opens from the end of the line: the right, or the left in RTL.
  const side = i18n.dir() === 'rtl' ? 'left' : 'right';

  // Only what is still listed counts as selected.
  const chosen = items.filter((item) => selected.has(item.id)).map((item) => item.id);
  const allChosen = items.length > 0 && chosen.length === items.length;

  const textOf = (item: StaffNotification) =>
    t(`bell.events.${item.event}`, {
      name: item.name ?? t('bell.someone'),
      count: item.count,
    });

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const deleteThese = async (ids: readonly string[]) => {
    try {
      const deleted = await remove(ids);
      toast.success(t('bell.deleted', { count: deleted }));
    } catch {
      toast.error(t('bell.deleteFailed'));
    }
    setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
  };

  const openItem = async (item: StaffNotification) => {
    if (item.readAt === null) await markRead(item.id).catch(() => undefined);
    setOpen(false);
    await navigate({ to: item.path });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          data-testid="notification-bell"
          aria-label={unread > 0 ? t('bell.openUnread', { count: unread }) : t('bell.title')}
          className="relative size-10 rounded-full text-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Bell aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              data-testid="notification-bell-count"
              className="absolute -end-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums ring-2 ring-background"
            >
              {unreadBadge(unread)}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={side}
        showCloseButton={false}
        className="w-full gap-0 bg-background sm:max-w-md"
        data-testid="notification-drawer"
      >
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b border-border p-5">
          <SheetTitle className="text-xl font-semibold">{t('bell.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('bell.description')}</SheetDescription>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('bell.close')}>
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetHeader>
        {items.length === 0 && status === 'loading' ? (
          <p aria-busy="true" className="p-5 text-sm text-muted-foreground">
            {t('bell.loading')}
          </p>
        ) : items.length === 0 && status === 'error' ? (
          <p role="alert" className="p-5 text-sm text-foreground">
            {t('bell.loadFailed')}
          </p>
        ) : items.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground" data-testid="notification-empty">
            {t('bell.empty')}
          </p>
        ) : (
          <>
            <div className="flex min-h-12 items-center gap-2 border-b border-border px-5 py-2">
              <Checkbox
                id={allId}
                checked={allChosen}
                onCheckedChange={(on) =>
                  setSelected(on === true ? new Set(items.map((item) => item.id)) : new Set())
                }
              />
              <label htmlFor={allId} className="cursor-pointer text-sm whitespace-nowrap">
                {t('bell.selectAll')}
              </label>
              {chosen.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ms-auto text-destructive hover:text-destructive"
                  data-testid="notification-delete-selected"
                  onClick={() => void deleteThese(chosen)}
                >
                  <Trash2 aria-hidden="true" />
                  {t('bell.deleteSelected', { count: chosen.length })}
                </Button>
              ) : null}
            </div>
            <ul className="flex-1 overflow-y-auto" data-testid="notification-list">
              {items.map((item) => {
                const text = textOf(item);
                const isUnread = item.readAt === null;
                return (
                  <li
                    key={item.id}
                    className="flex items-start border-b border-border"
                    data-testid={`notification-${item.id}`}
                  >
                    <span className="ps-5 pt-[1.125rem]">
                      <Checkbox
                        aria-label={t('bell.select', { text })}
                        checked={selected.has(item.id)}
                        onCheckedChange={(on) => toggle(item.id, on === true)}
                      />
                    </span>
                    <a
                      href={item.path}
                      onClick={(event) => {
                        event.preventDefault();
                        void openItem(item);
                      }}
                      className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-4 outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                    >
                      <span className="flex items-start gap-2">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full',
                            isUnread ? 'bg-primary' : 'bg-transparent',
                          )}
                        />
                        <span
                          className={cn(
                            'text-start text-sm leading-snug text-foreground',
                            isUnread && 'font-semibold',
                          )}
                        >
                          {text}
                        </span>
                      </span>
                      <span className="ps-4 text-xs text-muted-foreground">
                        <time dateTime={item.createdAt.toISOString()}>
                          {formatTimeAgo(item.createdAt, now, locale)}
                        </time>
                        {isUnread ? <span className="sr-only"> {t('bell.unread')}</span> : null}
                      </span>
                    </a>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('bell.deleteOne', { text })}
                      className="me-3 mt-3.5 text-muted-foreground hover:text-destructive"
                      onClick={() => void deleteThese([item.id])}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
