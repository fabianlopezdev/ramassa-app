import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toAppError } from '@ramassa/shared/errors';
import {
  completeMentoringRequest,
  scheduleMentoringRequest,
  summarizeMentoringTopics,
  type MentoringTopic,
  type StaffMentoringRequest,
} from '@ramassa/shared/mentoring';
import type { ConversationStaffMember } from '@ramassa/shared/messaging';

const topicKey: Readonly<Record<MentoringTopic, string>> = {
  personal_development: 'topicPersonalDevelopment',
  labor_orientation: 'topicLaborOrientation',
  asylum_rights: 'topicAsylumRights',
  gender_violence: 'topicGenderViolence',
  empowerment: 'topicEmpowerment',
  digital_skills: 'topicDigitalSkills',
  other: 'topicOther',
};

interface ScheduleDraft {
  readonly scheduledAt: string;
  readonly assignedStaffId: string;
  readonly staffNotes: string;
}

export function StaffMentoringQueue({
  requests,
  staff,
}: {
  readonly requests: readonly StaffMentoringRequest[];
  readonly staff: readonly ConversationStaffMember[];
}) {
  const { t, i18n } = useTranslation('mentoring');
  const router = useRouter();
  const [drafts, setDrafts] = useState<Readonly<Record<string, ScheduleDraft>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const topicSummary = useMemo(() => summarizeMentoringTopics(requests), [requests]);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.resolvedLanguage],
  );
  const preferredDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        dateStyle: 'medium',
        timeZone: 'Europe/Madrid',
      }),
    [i18n.resolvedLanguage],
  );
  const preferredTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }),
    [i18n.resolvedLanguage],
  );

  const draftFor = (request: StaffMentoringRequest): ScheduleDraft =>
    drafts[request.id] ?? {
      scheduledAt:
        request.scheduledAt === null ? '' : localDateTimeValue(new Date(request.scheduledAt)),
      assignedStaffId: request.assignedStaffId ?? staff[0]?.id ?? '',
      staffNotes: request.staffNotes ?? '',
    };

  const updateDraft = (request: StaffMentoringRequest, update: Partial<ScheduleDraft>) => {
    setDrafts((current) => ({ ...current, [request.id]: { ...draftFor(request), ...update } }));
  };

  const schedule = async (request: StaffMentoringRequest) => {
    const draft = draftFor(request);
    setSavingId(request.id);
    setErrorCode(null);
    try {
      await scheduleMentoringRequest(supabase, {
        requestId: request.id,
        scheduledAt: new Date(draft.scheduledAt).toISOString(),
        assignedStaffId: draft.assignedStaffId,
        staffNotes: draft.staffNotes,
      });
      await router.invalidate();
    } catch (error) {
      setErrorCode(toAppError(error).code);
    } finally {
      setSavingId(null);
    }
  };

  const complete = async (request: StaffMentoringRequest) => {
    setSavingId(request.id);
    setErrorCode(null);
    try {
      await completeMentoringRequest(supabase, request.id);
      await router.invalidate();
    } catch (error) {
      setErrorCode(toAppError(error).code);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('adminTitle')}</h1>
        <p className="max-w-3xl text-muted-foreground">{t('adminIntro')}</p>
        <p className="text-sm font-medium">{t('adminQueueCount', { count: requests.length })}</p>
      </header>

      <section aria-labelledby="mentoring-topic-summary" className="space-y-3">
        <h2 id="mentoring-topic-summary" className="text-lg font-semibold">
          {t('adminTopicBreakdown')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topicSummary.map((item) => (
            <div key={item.topic} className="rounded-xl border bg-card p-4 text-card-foreground">
              <p className="text-sm text-muted-foreground">{t(topicKey[item.topic])}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{item.count}</p>
            </div>
          ))}
        </div>
      </section>

      {errorCode === null ? null : (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {t('submitFailed')} ({errorCode})
        </p>
      )}

      {requests.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          {t('adminEmpty')}
        </p>
      ) : (
        <ol data-testid="mentoring-queue" className="grid gap-4 lg:grid-cols-2">
          {requests.map((request) => {
            const draft = draftFor(request);
            const isSaving = savingId === request.id;
            return (
              <li
                key={request.id}
                data-testid={`mentoring-row-${request.id}`}
                className="space-y-5 rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold">
                      {t('adminPlayer', {
                        name: `${request.playerFirstName} ${request.playerLastName}`,
                      })}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {t('adminRequested', { date: formatter.format(new Date(request.createdAt)) })}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                    {t(
                      request.status === 'requested'
                        ? 'statusRequested'
                        : request.status === 'scheduled'
                          ? 'statusScheduled'
                          : request.status === 'completed'
                            ? 'statusCompleted'
                            : 'statusCancelled',
                    )}
                  </span>
                </div>

                <div className="space-y-2 rounded-lg bg-muted/50 p-4">
                  <p className="font-semibold">{t(topicKey[request.topic])}</p>
                  {request.topicDetail === null ? null : (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {t('adminRequestDetail')}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{request.topicDetail}</p>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {t('adminPreferred', {
                      value:
                        request.preferredDate === null
                          ? t('adminNoPreference')
                          : formatPreferredSlot(
                              request.preferredDate,
                              request.preferredTime,
                              preferredDateFormatter,
                              preferredTimeFormatter,
                            ),
                    })}
                  </p>
                </div>

                {request.status === 'completed' || request.status === 'cancelled' ? null : (
                  <div className="space-y-4">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">{t('adminSchedule')}</span>
                      <Input
                        data-testid={`mentoring-schedule-${request.id}`}
                        type="datetime-local"
                        value={draft.scheduledAt}
                        onChange={(event) =>
                          updateDraft(request, { scheduledAt: event.target.value })
                        }
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">{t('adminAssignee')}</span>
                      <select
                        data-testid={`mentoring-assignee-${request.id}`}
                        value={draft.assignedStaffId}
                        onChange={(event) =>
                          updateDraft(request, { assignedStaffId: event.target.value })
                        }
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {staff.map((member) => (
                          <option key={member.id} value={member.id}>
                            {`${member.firstName} ${member.lastName}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">{t('adminStaffNotes')}</span>
                      <Textarea
                        data-testid={`mentoring-notes-${request.id}`}
                        value={draft.staffNotes}
                        maxLength={2000}
                        onChange={(event) =>
                          updateDraft(request, { staffNotes: event.target.value })
                        }
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        data-testid={`mentoring-submit-schedule-${request.id}`}
                        disabled={
                          isSaving ||
                          draft.scheduledAt.length === 0 ||
                          draft.assignedStaffId.length === 0
                        }
                        onClick={() => void schedule(request)}
                      >
                        {isSaving
                          ? t('adminSaving')
                          : t(
                              request.status === 'scheduled'
                                ? 'adminRescheduleAction'
                                : 'adminScheduleAction',
                            )}
                      </Button>
                      {request.status === 'scheduled' ? (
                        <Button
                          data-testid={`mentoring-complete-${request.id}`}
                          variant="outline"
                          disabled={isSaving}
                          onClick={() => void complete(request)}
                        >
                          {t('adminCompleteAction')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}

function localDateTimeValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatPreferredSlot(
  date: string,
  time: string | null,
  dateFormatter: Intl.DateTimeFormat,
  timeFormatter: Intl.DateTimeFormat,
): string {
  const formattedDate = dateFormatter.format(new Date(`${date}T12:00:00Z`));
  if (time === null) return formattedDate;
  return `${formattedDate}, ${timeFormatter.format(new Date(`1970-01-01T${time}Z`))}`;
}
