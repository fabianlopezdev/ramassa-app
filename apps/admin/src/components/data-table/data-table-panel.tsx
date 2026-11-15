import { Skeleton } from '@/components/ui/skeleton';
import type { ReactNode } from 'react';

/** The Control Center's card surface around a list, its controls and its pager. */
export function DataTablePanel({
  toolbar,
  children,
  footer,
}: {
  readonly toolbar: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border bg-card" data-slot="data-table-panel">
      <div className="border-b p-5">{toolbar}</div>
      <div className="min-w-0">{children}</div>
      {footer === undefined ? null : <div className="border-t px-5 py-3">{footer}</div>}
    </section>
  );
}

export function DataTableEmpty({
  icon,
  title,
  actions,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly actions: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      {actions}
    </div>
  );
}

export function DataTableSkeleton() {
  return (
    <div aria-hidden className="divide-y">
      {Array.from({ length: 5 }, (_, row) => (
        <div key={row} className="grid grid-cols-3 gap-8 px-5 py-4">
          {Array.from({ length: 3 }, (_, column) => (
            <Skeleton key={column} className="h-4 w-full motion-reduce:animate-none" />
          ))}
        </div>
      ))}
    </div>
  );
}
