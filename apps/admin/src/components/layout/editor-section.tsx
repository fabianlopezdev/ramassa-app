/**
 * A titled card of an editor (RAPP-641): a header row with the title and its
 * actions, the content, and an optional footer for Save. The screen editor
 * stacks them; the Fitxa de la jugadora (RAPP-650) draws each section as one,
 * with a grip before the title and its rows flush with the edges.
 */

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function EditorSection({
  title,
  leading,
  actions,
  footer,
  children,
  isFlush = false,
  className,
  testId,
}: {
  readonly title: ReactNode;
  /** Before the title, such as a drag grip. */
  readonly leading?: ReactNode;
  readonly actions?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  /** The content touches the card's edges (a list of rows). */
  readonly isFlush?: boolean;
  readonly className?: string;
  readonly testId?: string;
}) {
  return (
    <section className={cn('rounded-xl border bg-card', className)} data-testid={testId}>
      <header className="flex min-h-14 items-center gap-3 border-b px-5 py-3">
        {leading}
        <div className="flex min-w-0 flex-1 items-center">
          {typeof title === 'string' ? (
            <h2 className="text-start text-base font-semibold">{title}</h2>
          ) : (
            title
          )}
        </div>
        {actions}
      </header>
      <div className={isFlush ? undefined : 'p-5'}>{children}</div>
      {footer === undefined ? null : (
        <footer className="flex items-center justify-end gap-2 border-t px-5 py-3">{footer}</footer>
      )}
    </section>
  );
}
