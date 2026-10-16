/**
 * Who has re-registered for the current season (RAPP-306), reached from the
 * roster. `ssr: false` for the standard reason (the session lives in
 * localStorage, ADR-005).
 */

import { SeasonRegistrations } from '@/components/participants/season-registrations';
import { supabase } from '@/lib/supabase';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchSeasonRegistrations,
  fetchSeasons,
  remindUnregisteredPlayers,
} from '@ramassa/shared/seasons';

export const Route = createFileRoute('/_staff/participants/season')({
  ssr: false,
  loader: async () => {
    const [seasons, registrations] = await Promise.all([
      fetchSeasons(supabase),
      fetchSeasonRegistrations(supabase),
    ]);
    return { season: seasons.find((season) => season.isCurrent) ?? null, registrations };
  },
  component: SeasonPage,
});

function SeasonPage() {
  const { season, registrations } = Route.useLoaderData();
  const { permissions } = useAuth();
  const router = useRouter();
  return (
    <SeasonRegistrations
      season={season}
      registrations={registrations}
      canRemind={permissions.has('notifications.send')}
      onRemind={async (input) => {
        const count = await remindUnregisteredPlayers(supabase, {
          seasonName: season?.name ?? '',
          ...input,
        });
        await router.invalidate();
        return count;
      }}
    />
  );
}
