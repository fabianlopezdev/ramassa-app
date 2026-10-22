/**
 * The bell in the top bar (RAPP-635): what is waiting for her right now, one
 * row per queue she can act on, each a link to the page where it is handled.
 * The counts come from `lib/todo-counts`; opening the bell asks them again.
 * There is no read or unread state: a row leaves when its queue is empty.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { badgeCount, useTodoCounts } from '@/lib/todo-counts';
import { Link } from '@tanstack/react-router';
import { Bell, BellOff, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function TodoBell() {
  const { t } = useTranslation('admin');
  const { rows, total, refresh } = useTodoCounts();
  const [open, setOpen] = useState(false);
  const title = t('todos.title');

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) refresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          data-testid="todo-bell"
          aria-label={total > 0 ? t('todos.triggerLabel', { count: total }) : title}
          className="relative size-10 rounded-full text-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Bell aria-hidden="true" />
          {total > 0 ? (
            <Badge
              aria-hidden="true"
              data-testid="todo-bell-count"
              className="pointer-events-none absolute -end-0.5 -top-0.5 h-5 min-w-5 px-1 tabular-nums ring-2 ring-background"
            >
              {badgeCount(total)}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2" data-testid="todo-bell-panel">
        <p className="px-2 pt-1 text-sm font-semibold">{title}</p>
        {rows.length === 0 ? (
          <Empty className="gap-2 p-4" data-testid="todo-bell-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellOff aria-hidden="true" />
              </EmptyMedia>
              <EmptyDescription>{t('todos.empty')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-1">
            {rows.map(({ category, count }) => {
              const Icon = category.icon;
              return (
                <Item
                  key={category.key}
                  asChild
                  size="sm"
                  role="listitem"
                  data-testid={`todo-${category.key}`}
                >
                  <Link to={category.to} onClick={() => setOpen(false)}>
                    <ItemMedia variant="icon" className="text-muted-foreground">
                      <Icon aria-hidden="true" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t(category.labelKey)}</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Badge variant="muted" className="tabular-nums">
                        {badgeCount(count)}
                      </Badge>
                      <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
                    </ItemActions>
                  </Link>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </PopoverContent>
    </Popover>
  );
}
