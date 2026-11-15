/**
 * The frame of every Control Center page: one centred column beside the
 * sidebar, at most 1280 px wide, with one shared padding, the way Fabián's HQ
 * uses the space (RAPP-659, replacing the full width of RAPP-636). A page, its
 * header and its cards never cap their own width inside it, so every page has
 * the same width. Dialogs, sheets and menus keep their own widths.
 *
 *   <Page>
 *     <PageHeader title={...} description={...} actions={...} />
 *   </Page>
 *
 * A page whose root must be another element (an editor's form) takes the same
 * frame with `pageClassName()`.
 */
import { cn } from '@/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

const PAGE_FRAME = 'mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 p-4 sm:p-6 lg:px-10';

export function pageClassName(className?: string): string {
  return cn(PAGE_FRAME, className);
}

export function Page({ className, ...props }: ComponentProps<'section'>) {
  return <section data-slot="page" className={pageClassName(className)} {...props} />;
}

export interface PageHeaderProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Buttons at the end of the header row, such as "New". */
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn('flex flex-wrap items-start justify-between gap-x-6 gap-y-3', className)}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <h1 className="text-start text-2xl font-semibold">{title}</h1>
        {description === undefined ? null : (
          <p className="text-start text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
