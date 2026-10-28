/**
 * One participant, as the team works with her (RAPP-24): her record, the notes
 * the team keeps about her, and the activity timeline later phases feed.
 *
 * Her club profile header and tabs organize the existing record, registration,
 * material, notes and activity tools. Each tool keeps its own write behavior.
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
import { ParticipantConsents } from '@/components/participants/participant-consents';
import { ParticipantEquipment } from '@/components/participants/participant-equipment';
import { ParticipantFitxa } from '@/components/participants/participant-fitxa';
import { ParticipantNotes } from '@/components/participants/participant-notes';
import { ParticipantProfileHeader } from '@/components/participants/participant-profile-header';
import { ParticipantRgpd } from '@/components/participants/participant-rgpd';
import { ParticipantSignatures } from '@/components/participants/participant-signatures';
import { TestPlayerDelete } from '@/components/participants/test-player-delete';
import { TestPlayerScenarioPanel } from '@/components/participants/test-player-scenario';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { safeAsync } from '@/lib/observability';
import { missingLevel, seasonAnswersLines } from '@/lib/participant-fitxa';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AttendanceParticipantStats, AttendanceReportRow } from '@ramassa/shared/attendance';
import { useAuth } from '@ramassa/shared/auth';
import {
  recordPaperAuthorization,
  recordParticipantConsent,
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
  isStaffWritable,
  saveIntakePreset,
  uploadsAvailable,
  type CustomQuestionStates,
  type IntakeCatalog,
  type ParticipantCustomAnswer,
  type ParticipantCustomForm,
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
  /** Her season authorizations (RAPP-304). */
  readonly authorizations?: readonly ParticipantAuthorization[];
  /** Every consent decision of hers, the newest first (RAPP-699). */
  readonly consentHistory?: readonly ParticipantConsent[];
  /** The Fitxa layout, and her answers to every field with who gave each (RAPP-664). */
  readonly intakeCatalog?: IntakeCatalog;
  readonly customAnswers?: readonly ParticipantCustomAnswer[];
  /** A test player's situation, for the scenario switches (RAPP-619); null for a real woman. */
  readonly testScenario?: TestPlayerScenario | null;
  /** Her signatures of the form blocks (RAPP-690), read with participants.view_personal. */
  readonly formSignatures?: readonly ParticipantFormSignature[];
  /** Her asks of the forms the team created (RAPP-700), read with participants.view_personal. */
  readonly customForms?: readonly ParticipantCustomForm[];
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
  consentHistory = [],
  intakeCatalog = EMPTY_INTAKE_CATALOG,
  customAnswers = [],
  testScenario = null,
  formSignatures = [],
  customForms = [],
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
  const [activeTab, setActiveTab] = useState('profile');
  const [editingId, setEditingId] = useState<string | null>(null);
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

  function editProfile() {
    const field = intakeCatalog.layout?.fields.find(
      (field) => !field.isArchived && isStaffWritable(field) && missingLevel(field, sees) === null,
    );
    setActiveTab('profile');
    setEditingId(field?.id ?? 'preferred_language');
  }

  const canChangeStatus = teamTools && joined && permissions.has('participants.deactivate');
  const canChangeForum = teamTools && permissions.has('forum.moderate');
  const canReadRegistration = sees('participants.view_personal');
  const showRegistrationTab = canReadRegistration && (teamTools || formSignatures.length > 0);

  return (
    <Page>
      <Link
        to="/participants"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
        {t('detailBackToList')}
      </Link>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6" dir={i18n.dir()}>
        <div className="overflow-hidden rounded-xl border bg-card">
          <ParticipantProfileHeader
            participant={participant}
            onEdit={canReadRegistration ? editProfile : undefined}
            actions={
              canChangeStatus || canChangeForum ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t('profileDesign.actions')}
                      className="size-10 border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    {canChangeStatus ? (
                      <DropdownMenuItem
                        disabled={isChangingStatus}
                        onSelect={() => void toggleStatus()}
                      >
                        {participant.is_active
                          ? t('statusActionDeactivate')
                          : t('statusActionActivate')}
                      </DropdownMenuItem>
                    ) : null}
                    {canChangeForum ? (
                      <DropdownMenuItem
                        disabled={isChangingForumStatus}
                        onSelect={() => void toggleForumPosting()}
                      >
                        {participant.is_forum_banned
                          ? t('forumPostingEnableAction')
                          : t('forumPostingDisableAction')}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : undefined
            }
          />

          <div className="overflow-x-auto px-4 sm:px-6">
            <TabsList variant="line" className="h-14 min-w-max justify-start gap-2 p-0">
              <TabsTrigger value="profile" className="h-full rounded-none px-3 after:bottom-0">
                {t('sectionProfile')}
              </TabsTrigger>
              {showRegistrationTab ? (
                <TabsTrigger
                  value="registration"
                  className="h-full rounded-none px-3 after:bottom-0"
                >
                  {t('profileDesign.registration')}
                </TabsTrigger>
              ) : null}
              {teamTools ? (
                <TabsTrigger value="material" className="h-full rounded-none px-3 after:bottom-0">
                  {t('profileDesign.material')}
                </TabsTrigger>
              ) : null}
              {teamTools && permissions.has('participants.notes') ? (
                <TabsTrigger value="notes" className="h-full rounded-none px-3 after:bottom-0">
                  {t('sectionNotes')}
                </TabsTrigger>
              ) : null}
              {teamTools ? (
                <TabsTrigger value="activity" className="h-full rounded-none px-3 after:bottom-0">
                  {t('sectionActivity')}
                </TabsTrigger>
              ) : null}
            </TabsList>
          </div>
        </div>

        {statusErrorMessage === undefined ? null : (
          <p role="alert" className="text-sm text-destructive">
            {statusErrorMessage}
          </p>
        )}
        {forumStatusErrorMessage === undefined ? null : (
          <p role="alert" className="text-sm text-destructive">
            {forumStatusErrorMessage}
          </p>
        )}

        <TabsContent
          value="profile"
          forceMount
          className="flex flex-col gap-6 data-[state=inactive]:hidden"
        >
          <ParticipantFitxa
            participant={participant}
            catalog={intakeCatalog}
            customAnswers={customAnswers}
            answeredQuestions={answeredQuestions}
            choices={{ states: questionStates, customStates: customQuestionStates }}
            showChoices={!joined && (teamTools || isTestPlayer) && canReadRegistration}
            sees={sees}
            onSave={saveRecord}
            onSaveChoices={saveQuestionStates}
            choicesError={questionStatesErrorMessage}
            editingId={editingId}
            onEditingChange={setEditingId}
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
            customForms={customForms}
          />

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
        </TabsContent>

        {showRegistrationTab ? (
          <TabsContent
            value="registration"
            forceMount
            className="flex flex-col gap-6 data-[state=inactive]:hidden"
          >
            {teamTools && permissions.has('participants.view_personal') ? (
              <>
                <ParticipantAuthorizationPanel
                  participant={participant}
                  authorizations={authorizations}
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
                <ParticipantConsents
                  history={consentHistory}
                  catalogue={intakeCatalog.consents ?? []}
                  canRecord={permissions.has('consents.collect')}
                  onRecord={async (recording) => {
                    await recordParticipantConsent(supabase, {
                      profileId: participant.id,
                      ...recording,
                    });
                    await router.invalidate();
                  }}
                />
              </>
            ) : null}
            {formSignatures.length > 0 ? (
              <ParticipantSignatures signatures={formSignatures} catalog={intakeCatalog} />
            ) : null}
            {teamTools &&
            (permissions.has('rgpd.erase') || permissions.has('participants.deactivate')) ? (
              <ParticipantRgpd
                participant={participant}
                openDeletionRequestReason={openDeletionRequestReason}
              />
            ) : null}
          </TabsContent>
        ) : null}

        {teamTools ? (
          <>
            <TabsContent value="material" forceMount className="data-[state=inactive]:hidden">
              <ParticipantEquipment
                deliveries={deliveries}
                itemTypes={itemTypes}
                onAdd={addDelivery}
                errorMessage={deliveryErrorMessage}
              />
            </TabsContent>
            {permissions.has('participants.notes') ? (
              <TabsContent value="notes" forceMount className="data-[state=inactive]:hidden">
                <ParticipantNotes notes={notes} onAdd={addNote} errorMessage={noteErrorMessage} />
              </TabsContent>
            ) : null}
            <TabsContent
              value="activity"
              forceMount
              className="flex flex-col gap-6 data-[state=inactive]:hidden"
            >
              {permissions.has('attendance.reports') ? (
                <ParticipantAttendanceReport stats={attendanceStats} history={attendanceHistory} />
              ) : null}
              <ParticipantActivity entries={activity} />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </Page>
  );
}
