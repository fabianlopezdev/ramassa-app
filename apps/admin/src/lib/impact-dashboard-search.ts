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

interface ImpactPeriod {
  readonly start: string;
  readonly end: string;
}

/**
 * The defaults are a period, or a way to work one out when the address is
 * read. The page's own schema works it out each time (RAPP-974): a Cloudflare
 * Worker reads 1 January 1970 while it loads its code, so a period taken once
 * at that moment opened Tauler on 1970.
 */
export function createImpactDashboardSearchSchema(defaults: ImpactPeriod | (() => ImpactPeriod)) {
  const periodNow = () => (typeof defaults === 'function' ? defaults() : defaults);
  return z
    .object({
      start: z.iso.date().optional().catch(undefined),
      end: z.iso.date().optional().catch(undefined),
      category: z.uuid().optional().catch(undefined),
      entity: z.uuid().optional().catch(undefined),
    })
    .transform((value): ImpactDashboardSearch => {
      const period = periodNow();
      return {
        start: value.start ?? period.start,
        end: value.end ?? period.end,
        ...(value.category === undefined ? {} : { category: value.category }),
        ...(value.entity === undefined ? {} : { entity: value.entity }),
      };
    })
    .refine(({ start, end }) => start <= end, {
      message: 'Start date must not be after end date',
      path: ['end'],
    });
}

export const impactDashboardSearchSchema = createImpactDashboardSearchSchema(() =>
  createDefaultImpactPeriod(),
);
