/**
 * One participant's record (RAPP-24), reached from a row of the roster.
 *
 * `ssr: false`, for the reason the roster gives: the SESSION lives in
 * localStorage (ADR-005), so a loader running during the server render queries
 * as an anonymous user, RLS correctly refuses, and the screen renders a
 * confident "not found" over a participant who is right there. Moving the
 * loader to the browser means the caller is who the screen says she is.
 *
 * That matters more here than on the roster. This loader DECRYPTS, and every
 * call writes an RGPD access-audit row naming the staff member who made it. A
 * server render would file that row under nobody, or fail to file it at all.
 *
 * The three reads are issued together rather than in sequence: the notes and
 * the timeline do not depend on the record, and a staff member waiting three
 * round trips deep for a screen she opens all day is a screen she stops
 * opening.
 */

import { ParticipantDetail } from '@/components/participants/participant-detail';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  fetchAttendanceHistory,
  fetchAttendanceParticipantStats,
} from '@ramassa/shared/attendance';
import { fetchEquipmentDeliveries } from '@ramassa/shared/equipment';
import {
  fetchParticipantActivity,
  fetchParticipantDetail,
  fetchParticipantNotes,
} from '@ramassa/shared/participants';
import { fetchDeletionRequests } from '@ramassa/shared/rgpd';

export const Route = createFileRoute('/_staff/participants/$participantId')({
  ssr: false,
  loader: async ({ params }) => {
    const participant = await fetchParticipantDetail(supabase, params.participantId);
    // Nobody by that id, or nobody this staff member may read. The screen tells
    // those apart from a FAILED read, which throws and reaches the router's
    // error component with its code.
    if (participant === null) {
      return {
        participant: null,
        notes: [],
        activity: [],
        deliveries: [],
        attendanceStats: null,
        attendanceHistory: [],
        openDeletionRequestReason: undefined,
      };
    }
    const [notes, activity, openRequests, deliveries, attendanceStats, attendanceHistory] =
      await Promise.all([
        fetchParticipantNotes(supabase, params.participantId),
        fetchParticipantActivity(supabase, params.participantId),
        fetchDeletionRequests(supabase, 'open'),
        fetchEquipmentDeliveries(supabase, params.participantId),
        fetchAttendanceParticipantStats(supabase, params.participantId),
        fetchAttendanceHistory(supabase, params.participantId),
      ]);
    // Filtered here rather than asked for by participant: the queue read is one
    // round trip either way, and the same call feeds the staff-wide queue, so
    // there is one query to keep correct instead of two.
    const hers = openRequests.find((request) => request.profile_id === params.participantId);
    return {
      participant,
      notes,
      activity,
      deliveries,
      attendanceStats,
      attendanceHistory,
      // `undefined` = she never asked. `null` = she asked and gave no reason.
      openDeletionRequestReason: hers === undefined ? undefined : hers.reason,
    };
  },
  component: ParticipantDetailPage,
});

function ParticipantDetailPage() {
  const {
    participant,
    notes,
    activity,
    deliveries,
    attendanceStats,
    attendanceHistory,
    openDeletionRequestReason,
  } = Route.useLoaderData();

  if (participant === null) {
    return <ParticipantNotFound />;
  }
  return (
    <ParticipantDetail
      participant={participant}
      notes={notes}
      activity={activity}
      deliveries={deliveries}
      attendanceStats={attendanceStats}
      attendanceHistory={attendanceHistory}
      openDeletionRequestReason={openDeletionRequestReason}
    />
  );
}

/**
 * An empty state that says what to DO. A staff member who followed a stale
 * bookmark and one who was handed a link to another organization's participant
 * see the same thing, deliberately: telling her which of the two it is would
 * confirm that a participant with that id exists somewhere.
 */
function ParticipantNotFound() {
  const { t } = useTranslation('participants');
  return (
    <section className="flex flex-col items-start gap-3 p-6">
      <h1 className="text-start text-2xl font-semibold">{t('detailNotFoundTitle')}</h1>
      <p className="text-start text-sm text-muted-foreground">{t('detailNotFoundBody')}</p>
      <Button asChild variant="outline" size="lg">
        <Link to="/participants">{t('detailBackToList')}</Link>
      </Button>
    </section>
  );
}
