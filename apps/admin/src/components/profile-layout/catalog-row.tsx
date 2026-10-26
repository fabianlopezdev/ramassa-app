/**
 * One row of a catalogue page (RAPP-650, RAPP-699): Dades de les jugadores'
 * fields and Dades legals' consents, signatures and documents. A type tile,
 * the name and a line under it, a badge, where it is asked as chips, then the
 * row's action. Every row has one height and fixed columns, so names, badges
 * and chips line up down a section and across sections.
 */

import { FieldTypeIcon, type CatalogItemType } from '@/components/fields/field-type-icon';
import { SurfaceChips, type ChipSurface } from '@/components/fields/surface-chips';
import type { ReactNode } from 'react';

export function CatalogRow({
  type,
  name,
  detail,
  badge,
  surfaces,
  action,
  testId,
}: {
  readonly type: CatalogItemType;
  readonly name: string;
  /** The line under the name. */
  readonly detail: string;
  readonly badge?: ReactNode;
  /** Where it is asked; empty shows the team-only chip. */
  readonly surfaces: readonly ChipSurface[];
  /** Edit, or a link to the form that asks it. */
  readonly action?: ReactNode;
  readonly testId: string;
}) {
  return (
    <div className="flex h-16 items-center gap-3 px-5" data-testid={testId}>
      <FieldTypeIcon type={type} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-start text-sm font-medium">{name}</p>
        <p className="truncate text-start text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="flex w-20 shrink-0 justify-start">{badge}</span>
      <SurfaceChips surfaces={surfaces} className="hidden w-56 shrink-0 md:flex" />
      <span className="flex w-36 shrink-0 justify-end">{action}</span>
    </div>
  );
}
