import { z } from 'zod';

export interface ImpactDashboardSearch {
  readonly start: string;
  readonly end: string;
  readonly category?: string;
  readonly entity?: string;
}

function dateInMadrid(now: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function createDefaultImpactPeriod(now = new Date()) {
  const end = dateInMadrid(now);
  return { start: `${end.slice(0, 4)}-01-01`, end } as const;
}

export function createImpactDashboardSearchSchema(defaults: {
  readonly start: string;
  readonly end: string;
}) {
  return z
    .object({
      start: z.iso.date().optional().catch(undefined),
      end: z.iso.date().optional().catch(undefined),
      category: z.uuid().optional().catch(undefined),
      entity: z.uuid().optional().catch(undefined),
    })
    .transform((value): ImpactDashboardSearch => ({
      start: value.start ?? defaults.start,
      end: value.end ?? defaults.end,
      ...(value.category === undefined ? {} : { category: value.category }),
      ...(value.entity === undefined ? {} : { entity: value.entity }),
    }))
    .refine(({ start, end }) => start <= end, {
      message: 'Start date must not be after end date',
      path: ['end'],
    });
}

export const impactDashboardSearchSchema = createImpactDashboardSearchSchema(
  createDefaultImpactPeriod(),
);
