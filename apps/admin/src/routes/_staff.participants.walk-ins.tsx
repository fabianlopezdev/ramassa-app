/**
 * Walk-ins waiting for review (RAPP-305), reached from the roster: women who
 * signed the authorization on a staff tablet before they were in Ramassà.
 * Confirming creates her account, so it asks for a recent second factor.
 * `ssr: false` for the standard reason (the session lives in localStorage,
 * ADR-005).
 */

import { useStepUp } from '@/components/auth/step-up';
import { WalkInQueue } from '@/components/participants/walk-in-queue';
import { supabase } from '@/lib/supabase';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import {
  confirmWalkIn,
  discardWalkIn,
  fetchWalkInSignings,
  mergeWalkIn,
} from '@ramassa/shared/authorization';
import { fetchSeasonRegistrations } from '@ramassa/shared/seasons';

export const Route = createFileRoute('/_staff/participants/walk-ins')({
  ssr: false,
  loader: async () => {
    const [walkIns, registrations] = await Promise.all([
      fetchWalkInSignings(supabase),
      fetchSeasonRegistrations(supabase),
    ]);
    return {
      walkIns,
      players: registrations.map(({ profileId, name }) => ({ profileId, name })),
    };
  },
  component: WalkInsPage,
});

function WalkInsPage() {
  const { walkIns, players } = Route.useLoaderData();
  const withStepUp = useStepUp();
  const router = useRouter();
  return (
    <WalkInQueue
      walkIns={walkIns}
      players={players}
      onConfirm={async (id, email) => {
        await withStepUp(() => confirmWalkIn(supabase, id, email));
        await router.invalidate();
      }}
      onMerge={async (id, profileId) => {
        await mergeWalkIn(supabase, id, profileId);
        await router.invalidate();
      }}
      onDiscard={async (id) => {
        await discardWalkIn(supabase, id);
        await router.invalidate();
      }}
    />
  );
}
