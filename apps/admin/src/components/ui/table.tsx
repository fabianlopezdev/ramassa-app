import { cn } from '@/lib/utils';
import * as React from 'react';

/**
 * The shadcn table primitives. A real `<table>`, not a grid of divs: screen
 * readers announce row and column position from it for free, and the staff
 * roster is exactly the kind of dense data that people navigate by those
 * announcements.
 */

// Layout effects do not run on the server; the measure is a browser concern.
const useBrowserLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/**
 * Whether the container scrolls sideways. Only then does it take keyboard
 * focus, so arrow keys can scroll a wide table; a table that fits adds no tab
 * stop (WCAG 2.1.1, axe scrollable-region-focusable, RAPP-438).
 */
function useOverflowsX<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [overflows, setOverflows] = React.useState(false);
  const measure = React.useCallback(() => {
    const element = ref.current;
    if (element !== null) setOverflows(element.scrollWidth > element.clientWidth);
  }, []);
  // After every render, before paint: new rows arrive by re-rendering the
  // table, so the tab stop is right before anything (or anyone) reads it.
  useBrowserLayoutEffect(measure);
  React.useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);
  return { ref, overflows };
}

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  const { ref, overflows } = useOverflowsX<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-slot="table-container"
      className="relative w-full overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      tabIndex={overflows ? 0 : undefined}
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-2 align-middle whitespace-nowrap', className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow };
