import { MultilingualEditor } from '@/components/content/multilingual-editor';
import { TranslationReviewPanel } from '@/components/content/translation-review-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { requestCatalanTranslation } from '@/lib/translation-worker';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import {
  createTargetedNotificationSend,
  NOTIFICATION_TEMPLATE_CATEGORIES,
  notificationContentSchema,
  previewNotificationAudience,
  saveCustomNotificationGroup,
  saveNotificationTemplate,
  type CustomNotificationGroup,
  type NotificationAudience,
  type NotificationAudienceMember,
  type NotificationAudienceOptions,
  type NotificationSendHistory,
  type NotificationTemplate,
  type NotificationTemplateCategory,
} from '@ramassa/shared/notifications';
import type {
  CreateTranslationReviewOptions,
  TranslationReview,
} from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';
import { AudiencePicker } from './audience-picker';

const TARGET_LANGUAGES = ['es', 'en', 'ar', 'fa'] as const;

function reviewOptions(copy: NotificationTemplate['title']): CreateTranslationReviewOptions {
  return {
    sourceLanguage: 'ca',
    sourceText: copy.ca,
    translations: Object.fromEntries(
      TARGET_LANGUAGES.map((language) => [language, copy[language]]),
    ),
  };
}

function startGeneratedReview(
  review: TranslationReview,
  start: (options: CreateTranslationReviewOptions) => void,
) {
  start({
    sourceLanguage: review.sourceLanguage,
    sourceText: review.sourceText,
    translations: Object.fromEntries(
      review.suggestions.map((suggestion) => [suggestion.language, suggestion.machineText]),
    ),
  });
}

function approveAll(
  review: TranslationReview | undefined,
  approve: (language: SupportedLanguage) => void,
) {
  for (const suggestion of review?.suggestions ?? []) approve(suggestion.language);
}

function reviewedCopy(source: string, review: TranslationReview | undefined) {
  return notificationContentSchema.parse({
    ca: source,
    ...Object.fromEntries(
      (review?.suggestions ?? [])
        .filter((suggestion) => suggestion.status === 'approved')
        .map((suggestion) => [suggestion.language, suggestion.reviewedText]),
    ),
  });
}

function stateKey(state: NotificationSendHistory['state']) {
  if (state === 'awaiting_receipts') return 'stateAwaitingReceipts';
  return `state${state.slice(0, 1).toUpperCase()}${state.slice(1)}`;
}

function normalizedParticipantSearch(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

export function filterNotificationGroupParticipants(
  participants: NotificationAudienceOptions['participants'],
  search: string,
) {
  const query = normalizedParticipantSearch(search.trim());
  if (query.length === 0) return participants;
  return participants.filter((participant) =>
    normalizedParticipantSearch(participant.fullName).includes(query),
  );
}

export function NotificationWorkspace({
  templates,
  groups,
  history,
  options,
  onRefresh,
}: {
  readonly templates: readonly NotificationTemplate[];
  readonly groups: readonly CustomNotificationGroup[];
  readonly history: readonly NotificationSendHistory[];
  readonly options: NotificationAudienceOptions;
  readonly onRefresh: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation('notifications');
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedAudience, setSelectedAudience] = useState<NotificationAudience | null>(null);
  const [audience, setAudience] = useState<readonly NotificationAudienceMember[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<'sent' | 'template' | 'group' | 'error' | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] =
    useState<NotificationTemplateCategory>('engagement');
  const [groupId, setGroupId] = useState<string | undefined>();
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupParticipantIds, setGroupParticipantIds] = useState<readonly string[]>([]);

  const titleReview = useTranslationReview();
  const bodyReview = useTranslationReview();
  const deviceCount = useMemo(
    () => audience.reduce((total, member) => total + member.deviceCount, 0),
    [audience],
  );
  const visibleGroupParticipants = useMemo(() => {
    return filterNotificationGroupParticipants(options.participants, groupSearch);
  }, [groupSearch, options.participants]);

  useEffect(() => {
    let cancelled = false;
    if (selectedAudience === null) {
      setAudience([]);
      setIsPreviewing(false);
      return () => {
        cancelled = true;
      };
    }
    setIsPreviewing(true);
    void previewNotificationAudience(supabase, selectedAudience)
      .then((members) => {
        if (!cancelled) {
          setAudience(members);
          setNotice(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAudience([]);
          setNotice('error');
        }
      })
      .finally(() => {
        if (!cancelled) setIsPreviewing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAudience]);

  function applyTemplate(nextId: string) {
    setTemplateId(nextId);
    const template = templates.find((item) => item.id === nextId);
    if (template === undefined) {
      setTitle('');
      setBody('');
      titleReview.reset();
      bodyReview.reset();
      return;
    }
    setTitle(template.title.ca);
    setBody(template.body.ca);
    titleReview.start(reviewOptions(template.title));
    bodyReview.start(reviewOptions(template.body));
  }

  async function generateTranslations() {
    setNotice(null);
    setIsGenerating(true);
    try {
      const [titleResult, bodyResult] = await Promise.all([
        requestCatalanTranslation(title),
        requestCatalanTranslation(body),
      ]);
      if (!titleResult.ok || !bodyResult.ok) {
        setNotice('error');
        return;
      }
      startGeneratedReview(titleResult.value, titleReview.start);
      startGeneratedReview(bodyResult.value, bodyReview.start);
    } finally {
      setIsGenerating(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      selectedAudience === null ||
      audience.length === 0 ||
      !titleReview.isPublishable ||
      !bodyReview.isPublishable
    ) {
      setNotice('error');
      return;
    }
    setIsSending(true);
    setNotice(null);
    try {
      await createTargetedNotificationSend(supabase, {
        templateId: templateId.length === 0 ? null : templateId,
        title: reviewedCopy(title, titleReview.review),
        body: reviewedCopy(body, bodyReview.review),
        audience: selectedAudience,
        expectedRecipientCount: audience.length,
      });
      setNotice('sent');
      await onRefresh();
    } catch {
      setNotice('error');
    } finally {
      setIsSending(false);
    }
  }

  async function saveTemplate() {
    if (!titleReview.isPublishable || !bodyReview.isPublishable) {
      setNotice('error');
      return;
    }
    try {
      await saveNotificationTemplate(supabase, {
        name: templateName,
        category: templateCategory,
        title: reviewedCopy(title, titleReview.review),
        body: reviewedCopy(body, bodyReview.review),
      });
      setNotice('template');
      setTemplateName('');
      await onRefresh();
    } catch {
      setNotice('error');
    }
  }

  async function saveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await saveCustomNotificationGroup(supabase, {
        id: groupId,
        name: groupName,
        participantIds: groupParticipantIds,
      });
      setNotice('group');
      setGroupId(undefined);
      setGroupName('');
      setGroupSearch('');
      setGroupParticipantIds([]);
      await onRefresh();
    } catch {
      setNotice('error');
    }
  }

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n?.resolvedLanguage ?? 'ca', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n?.resolvedLanguage],
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-neutral-950">{t('title')}</h1>
        <p className="text-neutral-600">{t('intro')}</p>
      </header>

      <form
        onSubmit={send}
        className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-xl font-semibold">{t('composeTitle')}</h2>
        <label className="grid gap-2 text-sm font-medium">
          {t('templateLabel')}
          <select
            id="notification-template-picker"
            name="notification-template"
            data-testid="notification-template-picker"
            value={templateId}
            onChange={(event) => applyTemplate(event.target.value)}
            className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3"
          >
            <option value="">{t('customMessage')}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <MultilingualEditor
          fieldId="notification-title"
          sourceLabel={t('fieldTitle')}
          sourceValue={title}
          review={titleReview.review}
          maxLength={120}
          onSourceChange={(value) => {
            setTitle(value);
            titleReview.reset();
          }}
          onTranslationChange={titleReview.edit}
          translationNamespace="notifications"
        />
        <TranslationReviewPanel
          fieldId="notification-title"
          review={titleReview.review}
          onApprove={titleReview.approve}
          onReject={titleReview.reject}
          onApproveAll={() => approveAll(titleReview.review, titleReview.approve)}
          translationNamespace="notifications"
        />
        <MultilingualEditor
          fieldId="notification-body"
          sourceLabel={t('fieldBody')}
          sourceValue={body}
          review={bodyReview.review}
          maxLength={1000}
          onSourceChange={(value) => {
            setBody(value);
            bodyReview.reset();
          }}
          onTranslationChange={bodyReview.edit}
          translationNamespace="notifications"
        />
        <TranslationReviewPanel
          fieldId="notification-body"
          review={bodyReview.review}
          onApprove={bodyReview.approve}
          onReject={bodyReview.reject}
          onApproveAll={() => approveAll(bodyReview.review, bodyReview.approve)}
          translationNamespace="notifications"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={title.trim().length === 0 || body.trim().length === 0 || isGenerating}
          onClick={() => void generateTranslations()}
          data-testid="notification-generate"
        >
          {isGenerating ? t('generatingTranslations') : t('generateTranslations')}
        </Button>

        <fieldset className="grid gap-4 rounded-xl border border-neutral-200 p-4">
          <legend className="px-2 font-semibold">{t('audienceTitle')}</legend>
          <AudiencePicker
            idPrefix="notification"
            audience={selectedAudience}
            groups={groups}
            options={options}
            onChange={setSelectedAudience}
          />
          <div
            data-testid="notification-confirmation"
            data-recipient-count={audience.length}
            data-device-count={deviceCount}
            className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-800"
            aria-live="polite"
          >
            {isPreviewing
              ? t('previewing')
              : t('confirmation', { count: audience.length, devices: deviceCount })}
          </div>
          {selectedAudience !== null && !isPreviewing && audience.length === 0 ? (
            <p className="text-sm text-amber-700">{t('emptyAudience')}</p>
          ) : null}
        </fieldset>

        {notice === 'error' ? (
          <p role="alert" className="text-sm text-red-700">
            {titleReview.isPublishable && bodyReview.isPublishable
              ? t('error')
              : t('translationRequired')}
          </p>
        ) : null}
        {notice === 'sent' ? (
          <p role="status" className="text-sm text-green-700">
            {t('sendSuccess')}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={
            isSending ||
            audience.length === 0 ||
            !titleReview.isPublishable ||
            !bodyReview.isPublishable
          }
        >
          {isSending ? t('sending') : t('sendAction')}
        </Button>
      </form>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-xl font-semibold">{t('templatesTitle')}</h2>
          <Input
            id="notification-template-name"
            name="notification-template-name"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder={t('templateName')}
            aria-label={t('templateName')}
          />
          <select
            id="notification-template-category"
            name="notification-template-category"
            value={templateCategory}
            onChange={(event) =>
              setTemplateCategory(event.target.value as NotificationTemplateCategory)
            }
            className="min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
            aria-label={t('templateCategory')}
          >
            {NOTIFICATION_TEMPLATE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`category${category.slice(0, 1).toUpperCase()}${category.slice(1)}`)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            onClick={() => void saveTemplate()}
            disabled={
              templateName.trim().length === 0 ||
              !titleReview.isPublishable ||
              !bodyReview.isPublishable
            }
          >
            {t('saveTemplate')}
          </Button>
          {notice === 'template' ? (
            <p role="status" className="text-sm text-green-700">
              {t('templateSaved')}
            </p>
          ) : null}
        </div>

        <form
          onSubmit={saveGroup}
          className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5"
        >
          <h2 className="text-xl font-semibold">{t('groupsTitle')}</h2>
          <Input
            id="notification-group-name"
            name="notification-group-name"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder={t('groupName')}
            aria-label={t('groupName')}
          />
          <Input
            id="notification-group-search"
            name="notification-group-search"
            value={groupSearch}
            onChange={(event) => setGroupSearch(event.target.value)}
            placeholder={t('groupSearch')}
            aria-label={t('groupSearch')}
            data-testid="notification-group-search"
          />
          <fieldset className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-neutral-200 p-3">
            <legend className="px-2 text-sm font-medium">{t('groupMembers')}</legend>
            {visibleGroupParticipants.map((participant) => (
              <label key={participant.id} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  id={`notification-group-member-${participant.id}`}
                  name="notification-group-member"
                  value={participant.id}
                  type="checkbox"
                  data-testid={`notification-group-member-${participant.id}`}
                  checked={groupParticipantIds.includes(participant.id)}
                  onChange={(event) =>
                    setGroupParticipantIds((current) =>
                      event.target.checked
                        ? [...current, participant.id]
                        : current.filter((id) => id !== participant.id),
                    )
                  }
                />
                <span>
                  {participant.fullName} ({participant.language})
                </span>
              </label>
            ))}
            {visibleGroupParticipants.length === 0 ? (
              <p data-testid="notification-group-empty" className="text-sm text-neutral-600">
                {t('groupEmpty')}
              </p>
            ) : null}
          </fieldset>
          <Button type="submit" disabled={groupName.trim().length === 0}>
            {t('saveGroup')}
          </Button>
          {notice === 'group' ? (
            <p role="status" className="text-sm text-green-700">
              {t('groupSaved')}
            </p>
          ) : null}
          <ul className="space-y-2">
            {groups.map((group) => (
              <li
                key={group.id}
                data-testid={`notification-group-${group.id}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 p-3"
              >
                <span>
                  <strong>{group.name}</strong>
                  <br />
                  <small>{t('membersCount', { count: group.participantIds.length })}</small>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setGroupId(group.id);
                    setGroupName(group.name);
                    setGroupSearch('');
                    setGroupParticipantIds(group.participantIds);
                  }}
                >
                  {t('editGroup')}
                </Button>
              </li>
            ))}
          </ul>
        </form>
      </section>

      <section className="space-y-4" aria-labelledby="notification-history-title">
        <h2 id="notification-history-title" className="text-xl font-semibold">
          {t('historyTitle')}
        </h2>
        {history.length === 0 ? <p>{t('historyEmpty')}</p> : null}
        <ol data-testid="notification-history" className="grid gap-4 md:grid-cols-2">
          {history.map((item) => (
            <li
              key={item.id}
              data-testid={`notification-history-${item.id}`}
              data-recipient-count={item.recipientCount}
              data-device-count={item.deviceCount}
              className="rounded-xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex justify-between gap-3">
                <strong>{t(stateKey(item.state))}</strong>
                <time>{dateFormatter.format(new Date(item.createdAt))}</time>
              </div>
              <p>
                {t('historyAudience', {
                  audience: t(
                    `audience${item.audienceKind === 'custom_group' ? 'CustomGroup' : item.audienceKind.slice(0, 1).toUpperCase() + item.audienceKind.slice(1)}`,
                  ),
                })}
              </p>
              <p>
                {t('historyRecipients', { count: item.recipientCount })} ·{' '}
                {t('historyDevices', { count: item.deviceCount })}
              </p>
              <p>
                {t('historySent', { count: item.sentCount })} ·{' '}
                {t('historyDelivered', { count: item.deliveredCount })} ·{' '}
                {t('historyFailed', { count: item.failedCount })}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
