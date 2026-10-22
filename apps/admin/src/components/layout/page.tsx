/**
 * The frame of every Control Center page (RAPP-636): the full width beside the
 * sidebar with one shared padding. A page, its header and its cards never cap
 * their own width, so an intro runs as wide as the page and a card reaches the
 * far edge. Dialogs, sheets and menus keep their own widths.
 *
 *   <Page>
 *     <PageHeader title={...} description={...} actions={...} />
 *     <PageSection title={...} description={...}>...</PageSection>
 *   </Page>
 *
 * A page whose root must be another element (an editor's form) takes the same
 * frame with `pageClassName()`.
 */
import { cn } from '@/lib/utils';
import { useId, type ComponentProps, type ReactNode } from 'react';

const PAGE_FRAME = 'flex w-full min-w-0 flex-col gap-6 p-4 sm:p-6';

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

export interface PageSectionProps extends Omit<ComponentProps<'section'>, 'title'> {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}

/** A titled part of a page; the heading names the section for screen readers. */
export function PageSection({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: PageSectionProps) {
  const headingId = useId();
  return (
    <section
      data-slot="page-section"
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-6', className)}
      {...props}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 space-y-2">
          <h2 id={headingId} className="text-start text-xl font-semibold text-foreground">
            {title}
          </h2>
          {description === undefined ? null : (
            <p className="text-start text-sm leading-6 text-muted-foreground">{description}</p>
          )}
        </div>
        {actions === undefined ? null : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </header>
      {children}
    </section>
  );
}
