import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { requestCatalanTranslation } from '@/lib/translation-worker';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  areEventTranslationsApproved,
  buildWeeklyRecurrenceRule,
  createEvent,
  EVENT_SIGNUP_MODES,
  eventInputSchema,
  MAX_EVENT_LOCATION_LENGTH,
  MAX_EVENT_TITLE_LENGTH,
  parseWeeklyRecurrenceRule,
  toMadridLocalInput,
  toUtcInstant,
  updateEvent,
  type EventCategoryRow,
  type EventListRow,
  type EventSignupMode,
} from '@ramassa/shared/events';
import { MAX_TRANSLATION_TEXT_LENGTH } from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';
import { approveAll, reviewOptions, startGeneratedReview } from './announcement-editor';
import { EventCategoryBadge } from './event-category-badge';
import { OneOffEventScheduleFields, WeeklyEventScheduleFields } from './event-schedule-fields';
import { MultilingualEditor } from './multilingual-editor';
import { ScheduledPublishFields, type PublishMode } from './scheduled-publish-fields';
import { TranslationReviewPanel } from './translation-review-panel';

type RecurrenceKind = 'one_off' | 'weekly';

export interface EventEditorProps {
  readonly categories: readonly EventCategoryRow[];
  readonly event?: EventListRow;
  readonly onSaved: (event: EventListRow) => void | Promise<void>;
}

function initialMode(event: EventListRow | undefined): PublishMode {
  if (event === undefined || event.status === 'draft') return 'draft';
  if (event.published_at !== null && new Date(event.published_at).getTime() > Date.now()) {
    return 'scheduled';
  }
  return 'now';
}

function recurrenceValues(event: EventListRow | undefined) {
  if (event?.recurrence_rule === null || event === undefined) {
    return { kind: 'one_off' as const, interval: 1, count: 6 };
  }
  const parsed = parseWeeklyRecurrenceRule(event.recurrence_rule);
  return parsed?.kind === 'weekly'
    ? { kind: 'weekly' as const, interval: parsed.interval, count: parsed.count }
    : { kind: 'one_off' as const, interval: 1, count: 6 };
}

export function EventEditor({ categories, event, onSaved }: EventEditorProps) {
  const { t } = useTranslation(['events', 'errors']);
  const initialRecurrence = recurrenceValues(event);
  const [categoryId, setCategoryId] = useState(event?.category_id ?? categories[0]?.id ?? '');
  const [title, setTitle] = useState(event?.title.ca ?? '');
  const [description, setDescription] = useState(event?.description?.ca ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [locationUrl, setLocationUrl] = useState(event?.location_url ?? '');
  const [startsAt, setStartsAt] = useState(
    event === undefined ? '' : toMadridLocalInput(event.starts_at),
  );
  const [endsAt, setEndsAt] = useState(
    event?.ends_at === null || event === undefined ? '' : toMadridLocalInput(event.ends_at),
  );
  const [recurrenceKind, setRecurrenceKind] = useState<RecurrenceKind>(initialRecurrence.kind);
  const [interval, setInterval] = useState(initialRecurrence.interval);
  const [count, setCount] = useState(initialRecurrence.count);
  const [capacity, setCapacity] = useState(
    event?.max_participants === null || event === undefined ? '' : String(event.max_participants),
  );
  const [signupMode, setSignupMode] = useState<EventSignupMode>(event?.signup_mode ?? 'none');
  const [mode, setMode] = useState<PublishMode>(() => initialMode(event));
  const [publishedAt, setPublishedAt] = useState(
    event?.published_at === null || event === undefined
      ? ''
      : toMadridLocalInput(event.published_at),
  );
  const [expiresAt, setExpiresAt] = useState(
    event?.expires_at === null || event === undefined ? '' : toMadridLocalInput(event.expires_at),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [formInvalid, setFormInvalid] = useState(false);
  const titleReview = useTranslationReview(reviewOptions(title, event?.title ?? null));
  const descriptionReview = useTranslationReview(
    reviewOptions(description, event?.description ?? null),
  );
  const hasDescription = description.trim().length > 0;
  const selectedCategory = categories.find((category) => category.id === categoryId);

  async function generateTranslations() {
    setErrorCode(null);
    setIsGenerating(true);
    const requests = [
      { source: title, start: titleReview.start },
      ...(hasDescription ? [{ source: description, start: descriptionReview.start }] : []),
    ];
    const results = await Promise.all(
      requests.map(async ({ source, start }) => ({
        result: await requestCatalanTranslation(source),
        start,
      })),
    );
    const failed = results.find(({ result }) => !result.ok);
    if (failed !== undefined && !failed.result.ok) {
      setErrorCode(failed.result.error.code);
    } else {
      for (const item of results) {
        if (item.result.ok) startGeneratedReview(item.result.value, item.start);
      }
    }
    setIsGenerating(false);
  }

  function publicationTime(): string | null {
    if (mode === 'draft') return null;
    if (mode === 'scheduled') return publishedAt.length > 0 ? toUtcInstant(publishedAt) : null;
    if (
      event?.status === 'published' &&
      event.published_at !== null &&
      new Date(event.published_at).getTime() <= Date.now()
    ) {
      return event.published_at;
    }
    return new Date().toISOString();
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setErrorCode(null);
    setFormInvalid(false);
    const publishing = mode !== 'draft';
    if (
      publishing &&
      !areEventTranslationsApproved(
        { titleReview: titleReview.review, descriptionReview: descriptionReview.review },
        hasDescription,
      )
    ) {
      setErrorCode('TRANSLATION-4');
      return;
    }

    const input = {
      categoryId,
      title: localizedTextFromReview(title, titleReview.review),
      description: hasDescription
        ? localizedTextFromReview(description, descriptionReview.review)
        : null,
      location,
      locationUrl: locationUrl.trim().length === 0 ? null : locationUrl,
      startsAt: startsAt.length === 0 ? '' : toUtcInstant(startsAt),
      endsAt: endsAt.length === 0 ? null : toUtcInstant(endsAt),
      recurrenceRule:
        recurrenceKind === 'weekly' ? buildWeeklyRecurrenceRule(interval, count) : null,
      maxParticipants: capacity.length === 0 ? null : Number(capacity),
      signupMode,
      status: publishing ? ('published' as const) : ('draft' as const),
      publishedAt: publicationTime(),
      expiresAt: publishing && expiresAt.length > 0 ? toUtcInstant(expiresAt) : null,
    };
    if (!eventInputSchema.safeParse(input).success) {
      setFormInvalid(true);
      return;
    }

    setIsSaving(true);
    const result = await safeAsync(
      () =>
        event === undefined ? createEvent(supabase, input) : updateEvent(supabase, event.id, input),
      {
        code: 'DB-1',
        context: { operation: event === undefined ? 'create-event' : 'update-event' },
      },
    );
    setIsSaving(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    const navigation = await safeAsync(() => onSaved(result.value), {
      code: 'UNEXPECTED-1',
      context: { operation: 'navigate-after-event-save' },
    });
    if (!navigation.ok) setErrorCode(navigation.error.code);
  }

  const scheduleLabels = {
    startsAt: t('events:fieldStartsAt'),
    endsAt: t('events:fieldEndsAt'),
    interval: t('events:fieldInterval'),
    count: t('events:fieldCount'),
  };

  return (
    <form className="flex flex-col gap-6 p-6" onSubmit={submit} data-testid="event-editor">
      <h1 className="text-2xl font-semibold">
        {event === undefined ? t('events:newAction') : t('events:editTitle')}
      </h1>

      <label className="flex max-w-md flex-col gap-2">
        <span className="text-sm font-medium">{t('events:fieldCategory')}</span>
        <select
          required
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={categoryId}
          data-testid="event-category"
          onChange={(changeEvent) => setCategoryId(changeEvent.target.value)}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name.ca}
            </option>
          ))}
        </select>
      </label>
      {selectedCategory === undefined ? null : (
        <div data-testid="event-selected-category">
          <EventCategoryBadge category={selectedCategory} />
        </div>
      )}

      <MultilingualEditor
        fieldId="event-title"
        sourceLabel={t('events:fieldTitle')}
        sourceValue={title}
        review={titleReview.review}
        maxLength={MAX_EVENT_TITLE_LENGTH}
        onSourceChange={(value) => {
          setTitle(value);
          titleReview.reset();
        }}
        onTranslationChange={titleReview.edit}
      />
      <TranslationReviewPanel
        fieldId="event-title"
        review={titleReview.review}
        onApprove={titleReview.approve}
        onReject={titleReview.reject}
        onApproveAll={() => approveAll(titleReview.review, titleReview.approve)}
      />

      <MultilingualEditor
        fieldId="event-description"
        sourceLabel={t('events:fieldDescription')}
        sourceValue={description}
        review={descriptionReview.review}
        maxLength={MAX_TRANSLATION_TEXT_LENGTH}
        onSourceChange={(value) => {
          setDescription(value);
          descriptionReview.reset();
        }}
        onTranslationChange={descriptionReview.edit}
      />
      <TranslationReviewPanel
        fieldId="event-description"
        review={descriptionReview.review}
        onApprove={descriptionReview.approve}
        onReject={descriptionReview.reject}
        onApproveAll={() => approveAll(descriptionReview.review, descriptionReview.approve)}
      />

      <Button
        type="button"
        size="lg"
        variant="secondary"
        data-testid="event-generate"
        disabled={title.trim().length === 0 || isGenerating}
        onClick={() => void generateTranslations()}
      >
        {isGenerating ? t('events:generatingTranslations') : t('events:generateTranslations')}
      </Button>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('events:fieldLocation')}</span>
          <Input
            required
            maxLength={MAX_EVENT_LOCATION_LENGTH}
            value={location}
            data-testid="event-location"
            onChange={(changeEvent) => setLocation(changeEvent.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('events:fieldLocationUrl')}</span>
          <Input
            type="url"
            value={locationUrl}
            data-testid="event-location-url"
            onChange={(changeEvent) => setLocationUrl(changeEvent.target.value)}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t('events:fieldRecurrence')}</legend>
        <div className="flex flex-wrap gap-4">
          {(['one_off', 'weekly'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="event-recurrence"
                value={value}
                checked={recurrenceKind === value}
                data-testid={`event-recurrence-${value}`}
                onChange={() => setRecurrenceKind(value)}
              />
              {t(value === 'one_off' ? 'events:recurrenceOneOff' : 'events:recurrenceWeekly')}
            </label>
          ))}
        </div>
      </fieldset>

      {recurrenceKind === 'weekly' ? (
        <WeeklyEventScheduleFields
          startsAt={startsAt}
          endsAt={endsAt}
          interval={interval}
          count={count}
          labels={scheduleLabels}
          onStartsAtChange={setStartsAt}
          onEndsAtChange={setEndsAt}
          onIntervalChange={setInterval}
          onCountChange={setCount}
        />
      ) : (
        <OneOffEventScheduleFields
          startsAt={startsAt}
          endsAt={endsAt}
          labels={scheduleLabels}
          onStartsAtChange={setStartsAt}
          onEndsAtChange={setEndsAt}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('events:fieldCapacity')}</span>
          <Input
            type="number"
            min={1}
            max={10000}
            value={capacity}
            data-testid="event-capacity"
            onChange={(changeEvent) => setCapacity(changeEvent.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('events:fieldSignup')}</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={signupMode}
            data-testid="event-signup-mode"
            onChange={(changeEvent) => setSignupMode(changeEvent.target.value as EventSignupMode)}
          >
            {EVENT_SIGNUP_MODES.map((value) => (
              <option key={value} value={value}>
                {t(`events:signup${capitalize(value)}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ScheduledPublishFields
        fieldId="event"
        mode={mode}
        publishedAt={publishedAt}
        expiresAt={expiresAt}
        onModeChange={setMode}
        onPublishedAtChange={setPublishedAt}
        onExpiresAtChange={setExpiresAt}
      />

      {errorCode === 'TRANSLATION-4' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('events:translationRequired')}
        </p>
      ) : null}
      {formInvalid ? (
        <p role="alert" className="text-sm text-destructive" data-testid="event-form-error">
          {t('events:invalidForm')}
        </p>
      ) : null}
      {errorCode !== null && errorCode !== 'TRANSLATION-4' ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors:${errorCode}`)}
        </p>
      ) : null}

      <Button type="submit" size="lg" data-testid="event-save" disabled={isSaving}>
        {mode === 'draft'
          ? t('events:saveDraft')
          : event === undefined
            ? t('events:publish')
            : t('events:update')}
      </Button>
    </form>
  );
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
