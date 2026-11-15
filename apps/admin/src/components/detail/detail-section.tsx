/**
 * The admin's ONE way of showing a record (RAPP-24).
 *
 * Built to be shared, exactly as `DataTable` was: the entity portal (RAPP-25),
 * the equipment log (RAPP-27) and the event pages (RAPP-31) are all "a titled
 * block of label/value pairs", and four hand-rolled versions would be four
 * different answers to what an empty field looks like.
 *
 * Alignment is logical (`text-start`), so Arabic and Farsi read correctly with
 * no per-language styling.
 */

import type { ReactNode } from 'react';

export interface DetailSectionProps {
  readonly title: string;
  /** Shown under the title. Use it for what the reader needs before the data. */
  readonly description?: ReactNode;
  /** The section's own control, rendered at the end of the title row. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
}

export function DetailSection({ title, description, action, children }: DetailSectionProps) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-start text-lg font-semibold">{title}</h2>
          {description === undefined ? null : (
            <p className="text-start text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
