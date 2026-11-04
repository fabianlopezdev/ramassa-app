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
 *
 * Laid out as an Onboarding screen (RAPP-761): one Text box on top with the
 * screen's texts and its help and buttons (the screen's wording, which goes
 * live with either save), then the points or the legal text.
 */

import { AddPointButton, canAddPoint, PointsEditor } from '@/components/fields/points-editor';
import { EditorColumns } from '@/components/layout/editor-columns';
import { EditorSection } from '@/components/layout/editor-section';
import { TranslatableSource } from '@/components/layout/translate-from-catalan';
import { termsPhoneScreen, type TermsPhoneStep } from '@/components/legal/legal-phone-content';
import { SteppedPhone } from '@/components/onboarding/phone-preview';
import { useSaveKind } from '@/components/onboarding/save-kind-dialog';
import type { ScreenTexts } from '@/components/onboarding/screen-content';
import { CONTROL_COLUMN, useScreenWording } from '@/components/onboarding/screen-editor';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { changedCatalanTexts, isSameContent, withCatalanDrafts } from '@/lib/catalan-drafts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { SaveKind } from '@ramassa/shared/authorization';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
import {
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
  /** Her onboarding's screens: the terms screens' help and buttons. */
  readonly catalog?: IntakeCatalog;
  /** The screens the form shows, for the phone's "step X of Y" (RAPP-761). */
  readonly steps?: readonly TermsPhoneStep[];
}

export function AppTermsEditor({
  step,
  steps,
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
  // As it opened: what the translate button counts as changed, saves in between or not.
  const [openedContent] = useState(savedContent);
  const isContentDirty = !isSameContent(content, savedContent);
  const [status, setStatus] = useState<Status>('idle');
  // Anyone who accepted makes Desa ask (RAPP-696).
  const saveKind = useSaveKind({
    hasAnswers: published.some((version) => version.acceptanceCount > 0),
  });
  // The screen's help and buttons, as typed, for her phone (RAPP-761).
  const [typedWording, setTypedWording] = useState<ScreenTexts | undefined>(undefined);
  // The help and buttons are the screen's wording: they share the Text box and its save (RAPP-761).
  const wording = useScreenWording({
    catalog,
    screen: step,
    language,
    onLanguageChange: setLanguage,
    onChange: (texts) => {
      setTypedWording(texts);
      setStatus('idle');
    },
  });
  const isDirty = isContentDirty || wording.isChanged;

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

  /** The help and buttons go live with either save: Onboarding has no draft (RAPP-705). */
  async function saveWording(): Promise<boolean> {
    return !wording.isChanged || (await wording.store({ announce: false }));
  }

  async function saveDraft() {
    const parsed = parsedContent();
    if (parsed === null || !(await saveWording())) return;
    if (!isContentDirty) {
      toast.success(t('builtinScreens.saved'));
      return;
    }
    await run('saving', () => onSaveDraft(parsed), 'saved');
  }

  // Desa (RAPP-696): the draft as typed, published.
  async function save() {
    const parsed = parsedContent();
    if (parsed === null || !(await saveWording())) return;
    // Only the help or a button changed: nothing to publish.
    if (draft === null && !isContentDirty) {
      toast.success(t('builtinScreens.saved'));
      return;
    }
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
    typedWording,
    steps,
  );
  const direction = getLanguageDirection(language);
  const isBusy = status === 'saving' || status === 'publishing' || wording.isSaving;
  const canSave = draft !== null || isDirty;

  /** One text of the terms, laid out as the wording's own fields. */
  const textRow = (field: AppTermsTextField | 'body') => {
    const id = `app-terms-${field}`;
    const shared = {
      id,
      dir: direction,
      lang: language,
      value: inLanguage(content[field]),
    } as const;
    return (
      <Field key={field} orientation="responsive">
        <FieldContent>
          <FieldLabel htmlFor={id}>{t(`appTerms.field.${field}`)}</FieldLabel>
        </FieldContent>
        <div className={CONTROL_COLUMN}>
          {field === 'intro' || field === 'body' || field === 'media_hint' ? (
            <Textarea
              {...shared}
              rows={field === 'body' ? 10 : 3}
              onChange={(event) =>
                edit({ ...content, [field]: withLanguage(content[field], event.target.value) })
              }
            />
          ) : (
            <Input
              {...shared}
              onChange={(event) =>
                edit({ ...content, [field]: withLanguage(content[field], event.target.value) })
              }
            />
          )}
        </div>
      </Field>
    );
  };

  return (
    <div className="flex flex-col gap-6" data-testid="app-terms-editor">
      {saveKind.dialog}
      <EditorColumns
        translatable={{
          texts: () => changedCatalanTexts(content, openedContent),
          apply: (target, drafts) =>
            edit(withCatalanDrafts(content, openedContent, target, drafts)),
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
            <TranslatableSource source={wording.translatable} />
            {/* The screen's texts in one box on top, as an Onboarding screen's (RAPP-761). */}
            <EditorSection title={t('onboardingBoard.wording')} testId={`app-terms-text-${step}`}>
              <FieldGroup>
                {LINE_FIELDS[step].map(textRow)}
                {wording.content}
              </FieldGroup>
            </EditorSection>

            {step === 'terms' ? (
              <EditorSection title={t('appTerms.field.body')} testId="app-terms-body-section">
                <Textarea
                  id="app-terms-body"
                  aria-label={t('appTerms.field.body')}
                  rows={14}
                  dir={direction}
                  lang={language}
                  value={inLanguage(content.body)}
                  onChange={(event) =>
                    edit({ ...content, body: withLanguage(content.body, event.target.value) })
                  }
                />
              </EditorSection>
            ) : (
              <EditorSection
                title={t('appTerms.points')}
                testId="app-terms-points"
                footer={
                  canAddPoint(content.points) ? (
                    <AddPointButton
                      points={content.points}
                      onChange={(points) => edit({ ...content, points })}
                    />
                  ) : undefined
                }
              >
                <PointsEditor
                  idPrefix="app-terms"
                  points={content.points}
                  language={language}
                  onChange={(points) => edit({ ...content, points })}
                />
              </EditorSection>
            )}

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
