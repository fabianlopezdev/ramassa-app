/**
 * The old Textos legals address (RAPP-694). The page is gone: the season
 * authorization and the app terms are forms of their own (RAPP-696), so an
 * old link, a bookmark or a bell row opens the right one.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute('/_staff/legal')({
  ssr: false,
  validateSearch: z.object({
    tab: z.enum(['authorization', 'terms']).optional().catch(undefined),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: search.tab === 'terms' ? '/forms/terms' : '/forms/authorization',
      replace: true,
    });
  },
});
