/**
 * The app terms, versioned (RAPP-613): the published versions, the draft and
 * a live preview of what a player reads.
 *
 * Staff edit one draft, language by language: the introduction screen (title,
 * intro, points) and the terms screen (title, the legal text, the acceptance
 * wording, the photo and video choice and its note). Catalan is required in
 * every field; another language left empty shows the Catalan text, and the
 * preview says so. The draft is saved as often as needed. Publishing is final
 * and needs settings.organization: a published version never changes, and
 * every player accepts the new one on her next app open, so the button asks
 * once more before it publishes.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getLanguageDirection,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
} from '@ramassa/shared/i18n/languages';
import {
  APP_TERMS_MAX_POINTS,
  appTermsDraftSchema,
  cleanAppTermsContent,
  resolveAppTerms,
  type AppTermsContent,
  type AppTermsText,
  type AppTermsTextField,
  type AppTermsVersion,
} from '@ramassa/shared/intake';
import type { LanguageCode } from '@ramassa/shared/schemas';

const EMPTY_CONTENT: AppTermsContent = {
  title: { ca: '' },
  body: { ca: '' },
  intro_title: { ca: '' },
  intro: { ca: '' },
  points: [{ title: { ca: '' }, body: { ca: '' } }],
  accept_label: { ca: '' },
  media_label: { ca: '' },
  media_hint: { ca: '' },
};

/** The single-line fields, in the order she meets them. */
const LINE_FIELDS: readonly AppTermsTextField[] = [
  'intro_title',
  'intro',
  'title',
  'accept_label',
  'media_label',
  'media_hint',
];

type Status =
  'idle' | 'saving' | 'saved' | 'discarded' | 'publishing' | 'published' | 'invalid' | 'failed';

export interface AppTermsEditorProps {
  readonly versions: readonly AppTermsVersion[];
  /** settings.organization: only an admin decision asks every player again. */
  readonly canPublish: boolean;
  readonly onSaveDraft: (content: AppTermsContent) => Promise<void>;
  readonly onDiscardDraft: () => Promise<void>;
  readonly onPublish: () => Promise<number>;
}

export function AppTermsEditor({
  versions,
  canPublish,
  onSaveDraft,
  onDiscardDraft,
  onPublish,
}: AppTermsEditorProps) {
  const { t, i18n } = useTranslation('settings');
  const draft = versions.find((version) => version.versionNumber === null) ?? null;
  const published = versions.filter((version) => version.versionNumber !== null);
  const current = published[0] ?? null;
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [content, setContent] = useState<AppTermsContent>(
    draft?.content ?? current?.content ?? EMPTY_CONTENT,
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState<Status>('idle');

  const edit = (next: AppTermsContent) => {
    setContent(next);
    setIsConfirming(false);
    setStatus('idle');
  };
  const inLanguage = (text: AppTermsText) => text[language] ?? '';
  const withLanguage = (text: AppTermsText, value: string): AppTermsText => ({
    ...text,
    [language]: value,
  });

  async function run(next: Status, action: () => Promise<unknown>, done: Status) {
    setStatus(next);
    try {
      await action();
      setStatus(done);
    } catch {
      setStatus('failed');
    } finally {
      setIsConfirming(false);
    }
  }

  async function saveDraft() {
    const parsed = appTermsDraftSchema.safeParse(cleanAppTermsContent(content));
    if (!parsed.success) {
      setStatus('invalid');
      return;
    }
    await run('saving', () => onSaveDraft(parsed.data), 'saved');
  }

  async function publish() {
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }
    await run('publishing', onPublish, 'published');
  }

  const preview = resolveAppTerms(cleanAppTermsContent(content), language);
  const direction = getLanguageDirection(language);
  const isBusy = status === 'saving' || status === 'publishing';

  return (
    <div className="flex max-w-6xl flex-col gap-6" data-testid="app-terms-editor">
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <h3 className="text-start text-base font-semibold">{t('appTerms.versionsTitle')}</h3>
        <ul className="flex flex-col gap-1" data-testid="app-terms-versions">
          {draft === null ? null : (
            <li className="text-start text-sm">
              {t('appTerms.draftRow', {
                date: new Date(draft.updatedAt).toLocaleDateString(i18n.resolvedLanguage),
              })}
            </li>
          )}
          {published.map((version, index) => (
            <li key={version.id} className="text-start text-sm">
              {t('appTerms.versionRow', {
                number: version.versionNumber,
                date: new Date(version.publishedAt ?? version.updatedAt).toLocaleDateString(
                  i18n.resolvedLanguage,
                ),
                count: version.acceptanceCount,
              })}
              {index === 0 ? (
                <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                  {t('appTerms.currentBadge')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-start text-base font-semibold">{t('appTerms.editorTitle')}</h3>
            <p className="text-start text-sm text-muted-foreground">{t('appTerms.editorIntro')}</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>{t('appTerms.language')}</span>
            <select
              id="app-terms-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as LanguageCode)}
              className="h-9 max-w-xs rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {SUPPORTED_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NATIVE_NAMES[code]}
                </option>
              ))}
            </select>
          </label>

          {LINE_FIELDS.map((field) => (
            <AdminAuthField
              key={field}
              id={`app-terms-${field}`}
              label={t(`appTerms.field.${field}`)}
              dir={direction}
              value={inLanguage(content[field])}
              onChange={(event) =>
                edit({ ...content, [field]: withLanguage(content[field], event.target.value) })
              }
            />
          ))}

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>{t('appTerms.field.body')}</span>
            <Textarea
              id="app-terms-body"
              rows={10}
              dir={direction}
              value={inLanguage(content.body)}
              onChange={(event) =>
                edit({ ...content, body: withLanguage(content.body, event.target.value) })
              }
            />
          </label>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-start text-sm font-semibold">{t('appTerms.points')}</legend>
            {content.points.map((point, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-lg border p-3">
                <AdminAuthField
                  id={`app-terms-point-title-${index}`}
                  label={t('appTerms.pointTitle', { number: index + 1 })}
                  dir={direction}
                  value={inLanguage(point.title)}
                  onChange={(event) =>
                    edit({
                      ...content,
                      points: content.points.map((entry, at) =>
                        at === index
                          ? { ...entry, title: withLanguage(entry.title, event.target.value) }
                          : entry,
                      ),
                    })
                  }
                />
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  <span>{t('appTerms.pointBody', { number: index + 1 })}</span>
                  <Textarea
                    id={`app-terms-point-body-${index}`}
                    rows={2}
                    dir={direction}
                    value={inLanguage(point.body)}
                    onChange={(event) =>
                      edit({
                        ...content,
                        points: content.points.map((entry, at) =>
                          at === index
                            ? { ...entry, body: withLanguage(entry.body, event.target.value) }
                            : entry,
                        ),
                      })
                    }
                  />
                </label>
                {content.points.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    onClick={() =>
                      edit({ ...content, points: content.points.filter((_, at) => at !== index) })
                    }
                  >
                    {t('appTerms.removePoint')}
                  </Button>
                ) : null}
              </div>
            ))}
            {content.points.length < APP_TERMS_MAX_POINTS ? (
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() =>
                  edit({ ...content, points: [...content.points, { title: {}, body: {} }] })
                }
              >
                {t('appTerms.addPoint')}
              </Button>
            ) : null}
          </fieldset>

          {isConfirming ? (
            <p role="alert" className="text-start text-sm font-medium">
              {t('appTerms.publishConfirm')}
            </p>
          ) : null}
          {status === 'invalid' ? (
            <p role="alert" className="text-start text-sm text-destructive">
              {t('appTerms.invalid')}
            </p>
          ) : null}
          {status === 'failed' ? (
            <p role="alert" className="text-start text-sm text-destructive">
              {t('appTerms.failed')}
            </p>
          ) : null}
          {status === 'saved' || status === 'discarded' || status === 'published' ? (
            <p aria-live="polite" className="text-start text-sm text-muted-foreground">
              {t(`appTerms.${status}`)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={isBusy}
              onClick={() => void saveDraft()}
              data-testid="app-terms-save"
            >
              {t('appTerms.saveDraft')}
            </Button>
            {draft === null ? null : (
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => void run('saving', onDiscardDraft, 'discarded')}
                data-testid="app-terms-discard"
              >
                {t('appTerms.discardDraft')}
              </Button>
            )}
            {canPublish && draft !== null ? (
              <Button
                type="button"
                variant={isConfirming ? 'destructive' : 'secondary'}
                disabled={isBusy}
                onClick={() => void publish()}
                data-testid="app-terms-publish"
              >
                {isConfirming
                  ? t('appTerms.publishConfirmAction', {
                      number: (current?.versionNumber ?? 0) + 1,
                    })
                  : t('appTerms.publishAction')}
              </Button>
            ) : null}
          </div>
          {canPublish ? null : (
            <p className="text-start text-sm text-muted-foreground">
              {t('appTerms.publishNeedsAdmin')}
            </p>
          )}
        </section>

        <AppTermsPreview
          preview={preview}
          language={language}
          direction={direction}
          fallbackNote={
            preview.localeShown === language
              ? null
              : t('appTerms.previewFallback', { language: LANGUAGE_NATIVE_NAMES.ca })
          }
        />
      </div>
    </div>
  );
}

/** What she reads on her phone, screen by screen, in the chosen language. */
function AppTermsPreview({
  preview,
  language,
  direction,
  fallbackNote,
}: {
  readonly preview: ReturnType<typeof resolveAppTerms>;
  readonly language: LanguageCode;
  readonly direction: 'ltr' | 'rtl';
  readonly fallbackNote: string | null;
}) {
  const { t } = useTranslation('settings');
  return (
    <aside
      className="flex flex-col gap-4 rounded-xl border bg-muted/40 p-5"
      aria-label={t('appTerms.previewTitle')}
      data-testid="app-terms-preview"
    >
      <h3 className="text-start text-base font-semibold">{t('appTerms.previewTitle')}</h3>
      {fallbackNote === null ? null : (
        <p className="text-start text-xs text-muted-foreground" data-testid="app-terms-fallback">
          {fallbackNote}
        </p>
      )}
      <div
        lang={language}
        dir={direction}
        className="flex flex-col gap-3 rounded-lg border bg-background p-4"
        data-testid="app-terms-preview-intro"
      >
        <p className="text-start text-lg font-semibold">{preview.introTitle}</p>
        <p className="text-start text-sm">{preview.intro}</p>
        <ul className="flex flex-col gap-2">
          {preview.points.map((point, index) => (
            <li key={index} className="flex flex-col">
              <span className="text-start text-sm font-semibold">{point.title}</span>
              <span className="text-start text-sm text-muted-foreground">{point.body}</span>
            </li>
          ))}
        </ul>
      </div>
      <div
        lang={language}
        dir={direction}
        className="flex flex-col gap-3 rounded-lg border bg-background p-4"
        data-testid="app-terms-preview-terms"
      >
        <p className="text-start text-lg font-semibold">{preview.title}</p>
        <p className="text-start text-sm text-muted-foreground">{preview.mediaHint}</p>
        <p className="whitespace-pre-line rounded-md bg-muted p-3 text-start text-sm">
          {preview.body}
        </p>
        <p className="flex items-start gap-2 text-start text-sm">
          <span aria-hidden="true" className="mt-0.5 inline-block size-4 shrink-0 rounded border" />
          {preview.acceptLabel}
        </p>
        <p className="flex items-start gap-2 text-start text-sm">
          <span aria-hidden="true" className="mt-0.5 inline-block size-4 shrink-0 rounded border" />
          {preview.mediaLabel}
        </p>
      </div>
    </aside>
  );
}
