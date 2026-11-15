/**
 * Inviting a participant (RAPP-25, RAPP-224): every player joins with her own
 * email, and the invitation creates her account.
 *
 * The loader only reads the optional referral the invitation answers. The
 * write goes through a SECURITY DEFINER RPC that verifies the staff role
 * server-side. `ssr: false` for the reason every staff screen gives (the
 * session lives in localStorage, ADR-005).
 */

import { NewParticipant } from '@/components/participants/new-participant';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { fetchReferralAnswerKeys } from '@ramassa/shared/intake';
import {
  EMPTY_INTAKE_CATALOG,
  fetchIntakeCatalog,
  systemFieldsOf,
} from '@ramassa/shared/intake-builder';
import { fetchReferralRecord } from '@ramassa/shared/referrals';

export const Route = createFileRoute('/_staff/participants/new')({
  ssr: false,
  validateSearch: z.object({
    referral: z.uuid().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    // The question catalog plans the last step, what she will be asked
    // (RAPP-618). Without it the step shows the built-in questions only, as
    // her wizard does when it cannot load the catalog.
    const catalogRead = fetchIntakeCatalog(supabase).catch(() => EMPTY_INTAKE_CATALOG);
    if (deps.referral === undefined) {
      return { referral: null, catalog: await catalogRead, entityAnswerKeys: [] };
    }
    // With the entity's answers by field (RAPP-664), and which fields it
    // answered, so the last step counts them.
    const [referral, catalog, entityAnswerKeys] = await Promise.all([
      fetchReferralRecord(supabase, deps.referral, catalogRead.then(systemFieldsOf)),
      catalogRead,
      fetchReferralAnswerKeys(supabase, deps.referral),
    ]);
    return { referral, catalog, entityAnswerKeys };
  },
  component: NewParticipantPage,
});

function NewParticipantPage() {
  const { referral, catalog, entityAnswerKeys } = Route.useLoaderData();
  return (
    <NewParticipant referral={referral} catalog={catalog} entityAnswerKeys={entityAnswerKeys} />
  );
}
