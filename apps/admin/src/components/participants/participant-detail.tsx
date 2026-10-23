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

import { ParticipantAttendanceReport } from '@/components/attendance/attendance-report';
import { loadAuthenticatedMediaObjectUrl } from '@/components/content/authenticated-media-image';
import { DetailSection } from '@/components/detail/detail-section';
import { Page } from '@/components/layout/page';
import { ParticipantActivity } from '@/components/participants/participant-activity';
import { ParticipantAuthorizationPanel } from '@/components/participants/participant-authorization-panel';
import { ParticipantCustomAnswers } from '@/components/participants/participant-custom-answers';
import { ParticipantEditForm } from '@/components/participants/participant-edit-form';
import { ParticipantEquipment } from '@/components/participants/participant-equipment';
import { ParticipantNotes } from '@/components/participants/participant-notes';
import { ParticipantPrefillForm } from '@/components/participants/participant-prefill-form';
import { ParticipantProfileFields } from '@/components/participants/participant-profile-fields';
import { ParticipantQuestionStates } from '@/components/participants/participant-question-states';
import { ParticipantRgpd } from '@/components/participants/participant-rgpd';
import { TestPlayerDelete } from '@/components/participants/test-player-delete';
import { TestPlayerScenarioPanel } from '@/components/participants/test-player-scenario';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AttendanceParticipantStats, AttendanceReportRow } from '@ramassa/shared/attendance';
import { useAuth } from '@ramassa/shared/auth';
import {
  recordPaperAuthorization,
  type ParticipantAuthorization,
  type ParticipantConsent,
} from '@ramassa/shared/authorization';
import {
  addEquipmentDelivery,
  type EquipmentDeliveryRow,
  type HandoverItemType,
} from '@ramassa/shared/equipment';
import { AppError } from '@ramassa/shared/errors';
import { setForumPostingDisabled } from '@ramassa/shared/forum';
import {
  saveParticipantQuestionStates,
  type IntakeQuestion,
  type QuestionStates,
} from '@ramassa/shared/intake';
import {
  choiceChanges,
  deleteIntakePreset,
  EMPTY_INTAKE_CATALOG,
  saveIntakePreset,
  setParticipantCustomAnswers,
  uploadsAvailable,
  type CustomAnswers,
  type CustomQuestionStates,
  type IntakeCatalog,
  type ParticipantCustomAnswer,
  type PlayerChoices,
} from '@ramassa/shared/intake-builder';
import {
  addParticipantNote,
  scenarioCustomQuestions,
  setParticipantActive,
  setTestPlayerScenario,
  updateParticipantProfile,
  type ParticipantActivityEntry,
  type ParticipantDetailRow,
  type ParticipantNoteRow,
  type ProfilePrefillPayload,
  type TestPlayerScenario,
} from '@ramassa/shared/participants';
import {
  canDeleteTestPlayer,
  isLimitedToTestPlayers,
  type PermissionCode,
} from '@ramassa/shared/permissions';
import { deleteTestPlayer, eraseParticipant } from '@ramassa/shared/rgpd';
import type { EquipmentDeliveryInput, UpdateOwnProfilePayload } from '@ramassa/shared/schemas';
import { setPriorSeasons, type ParticipantSeasonAnswers } from '@ramassa/shared/seasons';
import { purgeParticipantMedia } from '@ramassa/shared/upload-client';

/** Her answers to Ramassà's questions outside any season, the ones her wizard reads. */
function wizardCustomAnswers(answers: readonly ParticipantCustomAnswer[]): CustomAnswers {
  return Object.fromEntries(
    answers
      .filter((answer) => answer.seasonId === null)
      .map((answer) => [answer.questionId, answer.value]),
  );
}

export interface ParticipantDetailProps {
  readonly participant: ParticipantDetailRow;
  readonly notes: readonly ParticipantNoteRow[];
  readonly activity: readonly ParticipantActivityEntry[];
  readonly deliveries: readonly EquipmentDeliveryRow[];
  /** The organization's item catalog, switched-off items included (RAPP-253). */
  readonly itemTypes: readonly HandoverItemType[];
  readonly attendanceStats: AttendanceParticipantStats | null;
  readonly attendanceHistory: readonly AttendanceReportRow[];
  /**
   * Her outstanding erasure request (RAPP-22), when she has one. `undefined`
   * means she has not asked; `null` means she asked and gave no reason, which is
   * her right and a different thing from not asking.
   */
  readonly openDeletionRequestReason?: string | null;
  /** Answered intake questions, for a woman who has not joined yet (RAPP-300). */
  readonly answeredQuestions?: readonly IntakeQuestion[];
  /** What her wizard asks, for a woman who has not joined yet (RAPP-301). */
  readonly questionStates?: QuestionStates;
  /** Her choices on Ramassà's questions (RAPP-645). */
  readonly customQuestionStates?: CustomQuestionStates;
  /** Her season authorizations and consents (RAPP-304). */
  readonly authorizations?: readonly ParticipantAuthorization[];
  readonly consents?: readonly ParticipantConsent[];
  readonly seasonAnswers?: readonly ParticipantSeasonAnswers[];
  /** The questions staff added, and her answers to them (RAPP-307). */
  readonly intakeCatalog?: IntakeCatalog;
  readonly customAnswers?: readonly ParticipantCustomAnswer[];
  /** A test player's situation, for the scenario switches (RAPP-619); null for a real woman. */
  readonly testScenario?: TestPlayerScenario | null;
}

export function ParticipantDetail({
  participant,
  notes,
  activity,
  deliveries,
  itemTypes,
  attendanceStats,
  attendanceHistory,
  openDeletionRequestReason,
  answeredQuestions = [],
  questionStates = {},
  customQuestionStates = {},
  authorizations = [],
  consents = [],
  seasonAnswers = [],
  intakeCatalog = EMPTY_INTAKE_CATALOG,
  customAnswers = [],
  testScenario = null,
}: ParticipantDetailProps) {
  const { t, i18n } = useTranslation(['participants', 'common', 'profile']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const router = useRouter();
  const navigate = useNavigate();
  const { user, permissions } = useAuth();
  // Her answer files (RAPP-610) come through the media Worker, which asks the
  // database whether this reader may open them; a blob URL opens in a new tab.
  const openAnswerFile = async (objectKey: string) => {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (accessToken === undefined) throw new AppError('AUTH-2');
    const url = await loadAuthenticatedMediaObjectUrl({ objectKey, mediaWorkerUrl, accessToken });
    window.open(url, '_blank', 'noopener');
  };

  // Not joined yet: staff created her profile and she has not accepted the terms (RAPP-300).
  const hasJoined = participant.terms_accepted_at !== null;
  // A test player (RAPP-615) is made up: test_players.manage reads and edits
  // all of her, as the database allows. The onboarding design role sees her
  // record and answers only, because the team's tools are for real players.
  const isTestPlayer = participant.is_test_account;
  const teamTools = !isLimitedToTestPlayers(permissions);
  const sees = (code: PermissionCode) =>
    permissions.has(code) || (isTestPlayer && permissions.has('test_players.manage'));
  const [isEditing, setIsEditing] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined);
  const [noteErrorMessage, setNoteErrorMessage] = useState<string | undefined>(undefined);
  const [questionStatesErrorMessage, setQuestionStatesErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [statusErrorMessage, setStatusErrorMessage] = useState<string | undefined>(undefined);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [deliveryErrorMessage, setDeliveryErrorMessage] = useState<string | undefined>(undefined);
  const [forumStatusErrorMessage, setForumStatusErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [isChangingForumStatus, setIsChangingForumStatus] = useState(false);

  /**
   * Deleting a test player (RAPP-617) is the RGPD erasure's two halves, in the
   * same order (ADR-023): her files, then her record. The token is read at the
   * moment of the call, so a session refreshed meanwhile is the one used.
   */
  async function deleteThisTestPlayer() {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (accessToken === undefined) throw new AppError('AUTH-2');
    const deleted = await eraseParticipant(participant.id, {
      purgeMedia: () =>
        purgeParticipantMedia({ mediaWorkerUrl, accessToken, participantId: participant.id }),
      deleteRecord: () => deleteTestPlayer(supabase, participant.id),
    });
    if (!deleted.ok) throw deleted.error;
    // Away from a record that no longer exists, without a way back to it.
    await navigate({ to: '/participants', replace: true });
  }

  async function saveProfile(payload: UpdateOwnProfilePayload | ProfilePrefillPayload) {
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

  // Throws on failure, so the control does not say "saved" (RAPP-301).
  async function saveQuestionStates(next: PlayerChoices) {
    setQuestionStatesErrorMessage(undefined);
    const result = await safeAsync(() =>
      saveParticipantQuestionStates(
        supabase,
        participant.id,
        // The app's questions and Ramassà's, only what changed (RAPP-645).
        choiceChanges({ states: questionStates, customStates: customQuestionStates }, next),
      ),
    );
    if (!result.ok) {
      setQuestionStatesErrorMessage(t('questionStatesFailed'));
      throw result.error;
    }
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

  async function addDelivery(delivery: EquipmentDeliveryInput) {
    setDeliveryErrorMessage(undefined);
    if (user === null) return;
    const result = await safeAsync(() =>
      addEquipmentDelivery(supabase, {
        participantId: participant.id,
        // Her OWN id: the policy requires it, because the log exists to say who
        // actually met the participant.
        deliveredBy: user.id,
        delivery,
      }),
    );
    if (!result.ok) {
      setDeliveryErrorMessage(t('equipmentAddFailed'));
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

  async function toggleForumPosting() {
    setForumStatusErrorMessage(undefined);
    setIsChangingForumStatus(true);
    const result = await safeAsync(() =>
      setForumPostingDisabled(supabase, participant.id, !participant.is_forum_banned),
    );
    setIsChangingForumStatus(false);
    if (!result.ok) {
      setForumStatusErrorMessage(t('forumPostingStatusChangeFailed'));
      return;
    }
    await router.invalidate();
  }

  return (
    <Page>
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
              {hasJoined ? (
                <Badge variant={participant.is_active ? 'secondary' : 'outline'}>
                  {participant.is_active ? t('rowActive') : t('rowInactive')}
                </Badge>
              ) : (
                <Badge variant="outline">{t('rowInvited')}</Badge>
              )}
              {participant.is_forum_banned ? (
                <Badge variant="destructive">{t('forumBanned')}</Badge>
              ) : null}
              {isTestPlayer ? <Badge variant="muted">{t('testBadge')}</Badge> : null}
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
            {/* A woman who has not joined has nothing to deactivate: cancelling her
                invitation removes her (RAPP-300). */}
            {hasJoined && teamTools ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={isChangingStatus}
                onClick={() => void toggleStatus()}
              >
                {participant.is_active ? t('statusActionDeactivate') : t('statusActionActivate')}
              </Button>
            ) : null}
            {teamTools ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={isChangingForumStatus}
                onClick={() => void toggleForumPosting()}
              >
                {participant.is_forum_banned
                  ? t('forumPostingEnableAction')
                  : t('forumPostingDisableAction')}
              </Button>
            ) : null}
          </div>
        </div>
        {forumStatusErrorMessage === undefined ? null : (
          <p role="alert" className="text-start text-sm text-destructive">
            {forumStatusErrorMessage}
          </p>
        )}
      </header>

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
        {isEditing && !hasJoined ? (
          <ParticipantPrefillForm
            participant={participant}
            answered={new Set(answeredQuestions)}
            canSeeSensitive={sees('participants.view_sensitive')}
            onSubmit={saveProfile}
            onCancel={() => {
              setSaveErrorMessage(undefined);
              setIsEditing(false);
            }}
            errorMessage={saveErrorMessage}
          />
        ) : isEditing ? (
          <ParticipantEditForm
            participant={participant}
            canSeeSensitive={sees('participants.view_sensitive')}
            onSubmit={saveProfile}
            onCancel={() => {
              setSaveErrorMessage(undefined);
              setIsEditing(false);
            }}
            errorMessage={saveErrorMessage}
          />
        ) : (
          <ParticipantProfileFields
            participant={participant}
            canSeeSensitive={sees('participants.view_sensitive')}
          />
        )}
      </DetailSection>

      {/* The design role chooses a test player's questions too (RAPP-618). */}
      {hasJoined || (!teamTools && !isTestPlayer) ? null : (
        <ParticipantQuestionStates
          states={questionStates}
          customStates={customQuestionStates}
          answered={new Set(answeredQuestions)}
          customAnswers={wizardCustomAnswers(customAnswers)}
          catalog={intakeCatalog}
          onSave={saveQuestionStates}
          errorMessage={questionStatesErrorMessage}
          onSavePreset={async (name, states) => {
            await saveIntakePreset(supabase, { id: null, name, states });
            await router.invalidate();
          }}
          onDeletePreset={async (id) => {
            await deleteIntakePreset(supabase, id);
            await router.invalidate();
          }}
        />
      )}

      <ParticipantCustomAnswers
        catalog={intakeCatalog}
        answers={customAnswers}
        canEdit={sees('participants.view_personal')}
        canEditSensitive={sees('participants.view_sensitive')}
        onSave={async (answers) => {
          await setParticipantCustomAnswers(supabase, participant.id, answers);
          await router.invalidate();
        }}
        onOpenFile={uploadsAvailable(mediaWorkerUrl) ? openAnswerFile : undefined}
      />

      {teamTools && permissions.has('participants.view_personal') ? (
        <ParticipantAuthorizationPanel
          participant={participant}
          authorizations={authorizations}
          consents={consents}
          canSeeHealth={permissions.has('participants.view_health')}
          onRecordPaper={async (signedOn) => {
            await recordPaperAuthorization(supabase, participant.id, signedOn);
            await router.invalidate();
          }}
          seasonAnswers={seasonAnswers}
          onSetPriorSeasons={async (count) => {
            await setPriorSeasons(supabase, participant.id, count);
            await router.invalidate();
          }}
        />
      ) : null}

      {isTestPlayer && testScenario !== null ? (
        <TestPlayerScenarioPanel
          scenario={testScenario}
          customQuestions={scenarioCustomQuestions(intakeCatalog)}
          owner={
            testScenario.orgId === null
              ? undefined
              : { orgId: testScenario.orgId, profileId: participant.id }
          }
          onChange={async (change) => {
            await setTestPlayerScenario(supabase, participant.id, change);
            await router.invalidate();
          }}
        />
      ) : null}

      {isTestPlayer && canDeleteTestPlayer(permissions) ? (
        <TestPlayerDelete
          name={`${participant.first_name} ${participant.last_name}`.trim()}
          onDelete={deleteThisTestPlayer}
        />
      ) : null}

      {teamTools ? (
        <>
          <ParticipantNotes notes={notes} onAdd={addNote} errorMessage={noteErrorMessage} />

          <ParticipantEquipment
            deliveries={deliveries}
            itemTypes={itemTypes}
            onAdd={addDelivery}
            errorMessage={deliveryErrorMessage}
          />

          <ParticipantAttendanceReport stats={attendanceStats} history={attendanceHistory} />

          <ParticipantActivity entries={activity} />

          {/* Last on the page, deliberately. These are the two gestures nobody
              should reach by scrolling past something else. */}
          <ParticipantRgpd
            participant={participant}
            openDeletionRequestReason={openDeletionRequestReason}
          />
        </>
      ) : null}
    </Page>
  );
}
