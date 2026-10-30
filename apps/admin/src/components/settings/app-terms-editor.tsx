/**
 * The app terms, versioned (RAPP-613), a form of their own (RAPP-696): a
 * board of two screens, each opened here with her phone beside it, as the
 * Onboarding screen editor shows a screen (RAPP-695).
 *
 * Staff edit one draft, language by language: the introduction screen (title,
 * intro, points) and the terms screen (title, the legal text, the acceptance
 * wording, the photo and video choice and its note). Catalan is required in
 * every field; another language left empty shows the Catalan text. The draft
 * is saved as often as needed. Desa publishes it and needs
 * settings.organization: a published version never changes. Once anyone
 * accepted, Desa asks whether this is a correction (her acceptance still
 * covers it) or a new version (everyone accepts again), RAPP-696.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { EditorColumns } from '@/components/layout/editor-columns';
import { termsPhoneScreen, type TermsPhoneStep } from '@/components/legal/legal-phone-content';
import { SteppedPhone } from '@/components/onboarding/phone-preview';
import { useSaveKind } from '@/components/onboarding/save-kind-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { changedCatalanTexts, isSameContent, withCatalanDrafts } from '@/lib/catalan-drafts';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SaveKind } from '@ramassa/shared/authorization';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
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
import { EMPTY_INTAKE_CATALOG, type IntakeCatalog } from '@ramassa/shared/intake-builder';
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

/** The single-line fields of each screen, in the order she meets them. */
const LINE_FIELDS: Readonly<Record<TermsPhoneStep, readonly AppTermsTextField[]>> = {
  'terms-intro': ['intro_title', 'intro'],
  terms: ['title', 'accept_label', 'media_label', 'media_hint'],
};

type Status =
  'idle' | 'saving' | 'saved' | 'discarded' | 'publishing' | 'published' | 'invalid' | 'failed';

export interface AppTermsEditorProps {
  /** The screen of the board being edited (RAPP-696). */
  readonly step: TermsPhoneStep;
  readonly versions: readonly AppTermsVersion[];
  /** settings.organization: only an admin decision asks every player again. */
  readonly canPublish: boolean;
  readonly onSaveDraft: (content: AppTermsContent) => Promise<void>;
  readonly onDiscardDraft: () => Promise<void>;
  /** Desa: publishes the draft as a correction or a new version (RAPP-696). */
  readonly onPublish: (kind: SaveKind) => Promise<number>;
  /** Her onboarding's screens: the terms screens' buttons. */
  readonly catalog?: IntakeCatalog;
  /** The screen's own wording (its buttons), under the terms' fields, in the language being edited. */
  readonly renderWording?: (language: LanguageCode) => ReactNode;
}

export function AppTermsEditor({
  step,
  renderWording,
  versions,
  canPublish,
  onSaveDraft,
  onDiscardDraft,
  onPublish,
  catalog = EMPTY_INTAKE_CATALOG,
}: AppTermsEditorProps) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const draft = versions.find((version) => version.versionNumber === null) ?? null;
  const published = versions.filter((version) => version.versionNumber !== null);
  const current = published[0] ?? null;
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  // What is saved, to compare with what is typed (RAPP-751).
  const [savedContent, setSavedContent] = useState<AppTermsContent>(
    draft?.content ?? current?.content ?? EMPTY_CONTENT,
  );
  const [content, setContent] = useState<AppTermsContent>(savedContent);
  const isDirty = !isSameContent(content, savedContent);
  const [status, setStatus] = useState<Status>('idle');
  // Anyone who accepted makes Desa ask (RAPP-696).
  const saveKind = useSaveKind({
    hasAnswers: published.some((version) => version.acceptanceCount > 0),
  });

  const edit = (next: AppTermsContent) => {
    setContent(next);
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
      setSavedContent(content);
    } catch {
      setStatus('failed');
    }
  }

  function parsedContent(): AppTermsContent | null {
    const parsed = appTermsDraftSchema.safeParse(cleanAppTermsContent(content));
    if (!parsed.success) setStatus('invalid');
    return parsed.success ? parsed.data : null;
  }

  async function saveDraft() {
    const parsed = parsedContent();
    if (parsed !== null) await run('saving', () => onSaveDraft(parsed), 'saved');
  }

  // Desa (RAPP-696): the draft as typed, published.
  async function save() {
    const parsed = parsedContent();
    if (parsed === null) return;
    setStatus('saving');
    try {
      await onSaveDraft(parsed);
    } catch {
      setStatus('failed');
      return;
    }
    setStatus('idle');
    await saveKind.request((kind) => run('publishing', () => onPublish(kind), 'published'));
  }

  // Her phone on this screen, worded as typed.
  const { content: phoneContent, ...position } = termsPhoneScreen(
    resolveAppTerms(cleanAppTermsContent(content), previewLanguage),
    step,
    previewLanguage,
    t,
    catalog,
  );
  const direction = getLanguageDirection(language);
  const isBusy = status === 'saving' || status === 'publishing';
  const canSave = draft !== null || isDirty;

  return (
    <div className="flex flex-col gap-6" data-testid="app-terms-editor">
      {saveKind.dialog}
      <EditorColumns
        translatable={{
          texts: () => changedCatalanTexts(content, savedContent),
          apply: (target, drafts) => edit(withCatalanDrafts(content, savedContent, target, drafts)),
        }}
        language={language}
        onLanguageChange={setLanguage}
        previewLanguage={previewLanguage}
        onPreviewLanguageChange={setPreviewLanguage}
        previewLabel={t('onboardingBoard.phone')}
        previewNote={t('onboardingBoard.phoneNote')}
        previewLanguageLabel={t('onboardingBoard.phoneLanguage')}
        preview={
          <SteppedPhone
            steps={[]}
            shown={step}
            onShow={() => undefined}
            label={t('onboardingBoard.phone')}
            content={phoneContent}
            language={previewLanguage}
            {...position}
          />
        }
        form={
          <>
            <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
              {LINE_FIELDS[step].map((field) => (
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

              {step === 'terms' ? (
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
              ) : null}

              {step === 'terms-intro' ? (
                <fieldset className="flex flex-col gap-3">
                  <legend className="text-start text-sm font-semibold">
                    {t('appTerms.points')}
                  </legend>
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
                            edit({
                              ...content,
                              points: content.points.filter((_, at) => at !== index),
                            })
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
              ) : null}
            </section>

            {renderWording?.(language)}

            <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
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
                  variant={canPublish ? 'outline' : 'default'}
                  disabled={isBusy || !isDirty}
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
                {canPublish ? (
                  <Button
                    type="button"
                    disabled={isBusy || !canSave}
                    onClick={() => void save()}
                    data-testid="app-terms-publish"
                  >
                    {t('saveDialog.save')}
                  </Button>
                ) : null}
              </div>
              {canPublish ? null : (
                <p className="text-start text-sm text-muted-foreground">
                  {t('appTerms.publishNeedsAdmin')}
                </p>
              )}
            </div>
          </>
        }
      />
    </div>
  );
}
