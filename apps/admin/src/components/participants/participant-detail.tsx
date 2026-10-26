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
import { Page } from '@/components/layout/page';
import { ParticipantActivity } from '@/components/participants/participant-activity';
import { ParticipantAuthorizationPanel } from '@/components/participants/participant-authorization-panel';
import { ParticipantEquipment } from '@/components/participants/participant-equipment';
import { ParticipantFitxa } from '@/components/participants/participant-fitxa';
import { ParticipantNotes } from '@/components/participants/participant-notes';
import { ParticipantRgpd } from '@/components/participants/participant-rgpd';
import { ParticipantSignatures } from '@/components/participants/participant-signatures';
import { TestPlayerDelete } from '@/components/participants/test-player-delete';
import { TestPlayerScenarioPanel } from '@/components/participants/test-player-scenario';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { safeAsync } from '@/lib/observability';
import { seasonAnswersLines } from '@/lib/participant-fitxa';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  EMPTY_PROFILE_LAYOUT,
  saveIntakePreset,
  uploadsAvailable,
  type CustomQuestionStates,
  type IntakeCatalog,
  type ParticipantCustomAnswer,
  type ParticipantFormSignature,
  type PlayerChoices,
} from '@ramassa/shared/intake-builder';
import {
  addParticipantNote,
  hasJoined,
  scenarioCustomQuestions,
  setParticipantActive,
  setTestPlayerScenario,
  updateParticipantRecord,
  type ParticipantActivityEntry,
  type ParticipantNoteRow,
  type ParticipantRecord,
  type ParticipantUpdate,
  type TestPlayerScenario,
} from '@ramassa/shared/participants';
import {
  canDeleteTestPlayer,
  isLimitedToTestPlayers,
  type PermissionCode,
} from '@ramassa/shared/permissions';
import { deleteTestPlayer, eraseParticipant } from '@ramassa/shared/rgpd';
import type { EquipmentDeliveryInput, LanguageCode } from '@ramassa/shared/schemas';
import { setPriorSeasons } from '@ramassa/shared/seasons';
import { purgeParticipantMedia } from '@ramassa/shared/upload-client';

export interface ParticipantDetailProps {
  readonly participant: ParticipantRecord;
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
  /** The Fitxa layout, and her answers to every field with who gave each (RAPP-664). */
  readonly intakeCatalog?: IntakeCatalog;
  readonly customAnswers?: readonly ParticipantCustomAnswer[];
  /** A test player's situation, for the scenario switches (RAPP-619); null for a real woman. */
  readonly testScenario?: TestPlayerScenario | null;
  /** Her signatures of the form blocks (RAPP-690), read with participants.view_personal. */
  readonly formSignatures?: readonly ParticipantFormSignature[];
  /** She has Onboarding screens saved as a Nova versió to review (RAPP-697). */
  readonly isReviewPending?: boolean;
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
  intakeCatalog = EMPTY_INTAKE_CATALOG,
  customAnswers = [],
  testScenario = null,
  isReviewPending = false,
  formSignatures = [],
}: ParticipantDetailProps) {
  const { t, i18n } = useTranslation(['participants', 'common', 'profile', 'settings']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  // Her answers by season, for her authorization panel (RAPP-306), read by field.
  const seasonAnswers = useMemo(
    () =>
      seasonAnswersLines(
        intakeCatalog.layout ?? EMPTY_PROFILE_LAYOUT,
        customAnswers,
        locale as LanguageCode,
        {
          yes: t('settings:questions.answers.yes'),
          no: t('settings:questions.answers.no'),
          maybe: t('settings:questions.answers.maybe'),
          archived: t('settings:questions.archivedOption'),
        },
      ),
    [intakeCatalog, customAnswers, locale, t],
  );
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

  // Not joined yet: staff created her profile and invited her (RAPP-300, RAPP-653).
  const joined = hasJoined(participant);
  // A test player (RAPP-615) is made up: test_players.manage reads and edits
  // all of her, as the database allows. The onboarding design role sees her
  // record and answers only, because the team's tools are for real players.
  const isTestPlayer = participant.is_test_account;
  const teamTools = !isLimitedToTestPlayers(permissions);
  const sees = (code: PermissionCode) =>
    permissions.has(code) || (isTestPlayer && permissions.has('test_players.manage'));
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

  // Throws on failure, so the field's editor stays open and says so.
  async function saveRecord(update: ParticipantUpdate) {
    const result = await safeAsync(() => updateParticipantRecord(supabase, participant.id, update));
    if (!result.ok) throw result.error;
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
              {joined ? (
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
              {isReviewPending ? (
                <Badge variant="outline" data-testid="participant-review-pending">
                  {t('reviewPendingBadge')}
                </Badge>
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
            {/* A woman who has not joined has nothing to deactivate: cancelling her
                invitation removes her (RAPP-300). */}
            {joined && teamTools ? (
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

      <ParticipantFitxa
        participant={participant}
        catalog={intakeCatalog}
        customAnswers={customAnswers}
        answeredQuestions={answeredQuestions}
        choices={{ states: questionStates, customStates: customQuestionStates }}
        // Set only before she joins (RAPP-301); the design role chooses a test
        // player's too (RAPP-618). The database needs participants.view_personal.
        showChoices={!joined && (teamTools || isTestPlayer) && sees('participants.view_personal')}
        sees={sees}
        onSave={saveRecord}
        onSaveChoices={saveQuestionStates}
        choicesError={questionStatesErrorMessage}
        onSavePreset={async (name, states) => {
          await saveIntakePreset(supabase, { id: null, name, states });
          await router.invalidate();
        }}
        onDeletePreset={(preset) => {
          if (window.confirm(t('questionStatesDeletePreset', { name: preset.name }))) {
            void deleteIntakePreset(supabase, preset.id).then(() => router.invalidate());
          }
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

      {formSignatures.length > 0 && sees('participants.view_personal') ? (
        <ParticipantSignatures signatures={formSignatures} catalog={intakeCatalog} />
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
