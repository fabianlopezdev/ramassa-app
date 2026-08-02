/**
 * One participant, as the team works with her (RAPP-24): her record, the notes
 * the team keeps about her, and the activity timeline later phases feed.
 *
 * This file owns what is SPECIFIC to a participant. How a titled block of
 * label/value pairs looks lives in the shared `DetailSection`, exactly as how a
 * table looks lives in the shared `DataTable`, so the entity portal and the
 * event pages that follow inherit the behaviour instead of re-deriving it.
 *
 * Every write goes back through the route LOADER rather than patching local
 * state. That costs a round trip and buys the thing that matters on a screen
 * showing decrypted personal data: what is on screen is what the database
 * holds, including the fields the server normalised on the way in. It also
 * means a save that silently did nothing (a policy refused it, another staff
 * member changed the row first) shows up immediately as unchanged values,
 * instead of as an optimistic edit that looks saved and is not.
 */

import { DetailSection } from '@/components/detail/detail-section';
import { ParticipantActivity } from '@/components/participants/participant-activity';
import { ParticipantEditForm } from '@/components/participants/participant-edit-form';
import { ParticipantNotes } from '@/components/participants/participant-notes';
import { ParticipantProfileFields } from '@/components/participants/participant-profile-fields';
import { ParticipantRgpd } from '@/components/participants/participant-rgpd';
import { ResetPasswordControl } from '@/components/participants/reset-password';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { Link, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import {
  addParticipantNote,
  setParticipantActive,
  updateParticipantProfile,
  type ParticipantActivityEntry,
  type ParticipantDetailRow,
  type ParticipantNoteRow,
} from '@ramassa/shared/participants';
import type { UpdateOwnProfilePayload } from '@ramassa/shared/schemas';

export interface ParticipantDetailProps {
  readonly participant: ParticipantDetailRow;
  readonly notes: readonly ParticipantNoteRow[];
  readonly activity: readonly ParticipantActivityEntry[];
  /**
   * Her outstanding erasure request (RAPP-22), when she has one. `undefined`
   * means she has not asked; `null` means she asked and gave no reason, which is
   * her right and a different thing from not asking.
   */
  readonly openDeletionRequestReason?: string | null;
}

export function ParticipantDetail({
  participant,
  notes,
  activity,
  openDeletionRequestReason,
}: ParticipantDetailProps) {
  const { t, i18n } = useTranslation(['participants', 'common', 'profile']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const router = useRouter();
  const { user } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined);
  const [noteErrorMessage, setNoteErrorMessage] = useState<string | undefined>(undefined);
  const [statusErrorMessage, setStatusErrorMessage] = useState<string | undefined>(undefined);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  async function saveProfile(payload: UpdateOwnProfilePayload) {
    setSaveErrorMessage(undefined);
    const result = await safeAsync(() =>
      updateParticipantProfile(supabase, participant.id, payload),
    );
    if (!result.ok) {
      setSaveErrorMessage(t('profile:saveFailed'));
      return;
    }
    setIsEditing(false);
    await router.invalidate();
  }

  async function addNote(body: string) {
    setNoteErrorMessage(undefined);
    if (user === null) return;
    const result = await safeAsync(() =>
      addParticipantNote(supabase, {
        participantId: participant.id,
        authorId: user.id,
        body,
      }),
    );
    if (!result.ok) {
      setNoteErrorMessage(t('noteAddFailed'));
      return;
    }
    await router.invalidate();
  }

  async function toggleStatus() {
    setStatusErrorMessage(undefined);
    setIsChangingStatus(true);
    const result = await safeAsync(() =>
      setParticipantActive(supabase, participant.id, !participant.is_active),
    );
    setIsChangingStatus(false);
    if (!result.ok) {
      setStatusErrorMessage(t('statusChangeFailed'));
      return;
    }
    await router.invalidate();
  }

  return (
    <section className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <Link
          to="/participants"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {t('detailBackToList')}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-start text-2xl font-semibold">
                {`${participant.first_name} ${participant.last_name}`}
              </h1>
              <Badge variant={participant.is_active ? 'secondary' : 'outline'}>
                {participant.is_active ? t('rowActive') : t('rowInactive')}
              </Badge>
              {participant.is_forum_banned ? (
                <Badge variant="destructive">{t('forumBanned')}</Badge>
              ) : null}
            </div>
            <p className="text-start text-sm text-muted-foreground">
              {t('detailJoinedOn', {
                date: new Date(participant.created_at).toLocaleDateString(locale),
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {statusErrorMessage === undefined ? null : (
              <p aria-live="polite" className="text-start text-sm text-destructive">
                {statusErrorMessage}
              </p>
            )}
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={isChangingStatus}
              onClick={() => void toggleStatus()}
            >
              {participant.is_active ? t('statusActionDeactivate') : t('statusActionActivate')}
            </Button>
          </div>
        </div>
      </header>

      {/* Only an admin-created account HAS a password; the RPC refuses the
          others, and this render condition keeps the button and the refusal
          in agreement. */}
      {participant.auth_method === 'admin_created' ? (
        <ResetPasswordControl participantId={participant.id} />
      ) : null}

      <DetailSection
        title={t('sectionProfile')}
        // Said out loud rather than left implicit: reading this block wrote an
        // audit row naming this staff member and this moment. A logged action
        // nobody was told about is a surprise, and this team's trust is the
        // product.
        description={t('accessLogged')}
        action={
          isEditing ? null : (
            <Button type="button" size="lg" onClick={() => setIsEditing(true)}>
              {t('editAction')}
            </Button>
          )
        }
      >
        {isEditing ? (
          <ParticipantEditForm
            participant={participant}
            onSubmit={saveProfile}
            onCancel={() => {
              setSaveErrorMessage(undefined);
              setIsEditing(false);
            }}
            errorMessage={saveErrorMessage}
          />
        ) : (
          <ParticipantProfileFields participant={participant} />
        )}
      </DetailSection>

      <ParticipantNotes notes={notes} onAdd={addNote} errorMessage={noteErrorMessage} />

      <ParticipantActivity entries={activity} />

      {/* Last on the page, deliberately. These are the two gestures nobody
          should reach by scrolling past something else. */}
      <ParticipantRgpd
        participant={participant}
        openDeletionRequestReason={openDeletionRequestReason}
      />
    </section>
  );
}
