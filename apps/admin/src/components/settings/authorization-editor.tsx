/**
 * The participation authorization, per season (RAPP-304), fully editable
 * (RAPP-614): the published versions, one draft, and a live preview of what a
 * player reads and answers.
 *
 * It is a board of screens (RAPP-696): each card opens one screen here, the
 * form on one side and her phone on that screen beside it, as the Onboarding
 * screen editor shows a screen (RAPP-695).
 *
 * Staff edit the draft language by language: the document (title, sections,
 * season documents) and the wording of the form and of re-registration. The
 * consents screen asks consents of Dades legals (RAPP-699): placed, ordered,
 * reworded and required with the shared picker, saved at once; the draft and
 * Desa take them as the catalogue holds them then. The Health
 * screen asks fields of Dades de les jugadores (RAPP-698): her health and her
 * emergency contact among them, placed, reworded and required with the
 * shared field picker, saved at once like any screen's. Each wording field
 * shows the text her phone shows (RAPP-710): the version's text, else the
 * app's own in that language, as real text. Clearing an optional text removes
 * it from her phone; a required one cannot be saved empty. Onboarding
 * designers save and discard the draft. Desa publishes it and needs
 * settings.organization: once anyone signed the season's version, it asks
 * whether this is a correction (her signature still covers it) or a new
 * version (everyone signs again), RAPP-696.
 *
 * A draft is published to a season (RAPP-694): the current one, or a future
 * one the team prepares ahead. A future season's version waits until that
 * season is marked current.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { EditorColumns } from '@/components/layout/editor-columns';
import {
  AUTHORIZATION_FIELD_STEP,
  authorizationPhoneScreen,
  type AuthorizationPhoneStep,
} from '@/components/legal/legal-phone-content';
import { SteppedPhone } from '@/components/onboarding/phone-preview';
import { useSaveKind } from '@/components/onboarding/save-kind-dialog';
import { ScreenFieldsSection } from '@/components/onboarding/screen-fields';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { changedCatalanTexts, isSameContent, withCatalanDrafts } from '@/lib/catalan-drafts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AUTHORIZATION_BUNDLED_TEXT_KEYS,
  AUTHORIZATION_TEXT_FIELDS,
  authorizationContentSchema,
  isOptionalAuthorizationTextField,
  orderedConsents,
  type AuthorizationContent,
  type AuthorizationText,
  type AuthorizationTextField,
  type AuthorizationVersion,
  type SaveKind,
} from '@ramassa/shared/authorization';
import { getLanguageDirection, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import { staffTextToSave } from '@ramassa/shared/i18n/localized-content';
import {
  authorizationConsentsFromCatalog,
  EMPTY_INTAKE_CATALOG,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { publishableSeasons, type Season } from '@ramassa/shared/seasons';

const PREVIEW_SEASON = '2026/27';

const EMPTY_CONTENT: AuthorizationContent = {
  title: { ca: '' },
  sections: [{ key: 'section_1', title: { ca: '' }, body: { ca: '' } }],
  consents: {
    participation: { label: { ca: '' }, required: true, position: 0 },
    data_processing: { label: { ca: '' }, required: true, position: 1 },
    code_of_conduct: { label: { ca: '' }, required: true, position: 2 },
    health_data: { label: { ca: '' }, required: true, position: 3 },
    image_rights: { label: { ca: '' }, required: false, position: 4 },
  },
  texts: {},
  attachments: [],
};

/**
 * Empty languages are dropped, so they fall back instead of showing a blank.
 * An optional wording keeps them: staff cleared it, so her phone shows none
 * (RAPP-710).
 */
function cleanText(text: AuthorizationText, keepsBlank = false): AuthorizationText {
  return Object.fromEntries(
    Object.entries(text)
      .map(([language, value]) => [language, (value ?? '').trim()] as const)
      .filter(([, value]) => keepsBlank || value !== ''),
  );
}

/** Wording overrides: a field with no text in any language is left out. */
function cleanTexts<Texts extends Readonly<Record<string, AuthorizationText | undefined>>>(
  texts: Texts,
): Texts {
  return Object.fromEntries(
    Object.entries(texts)
      .map(
        ([field, text]) =>
          [field, cleanText(text ?? {}, isOptionalAuthorizationTextField(field))] as const,
      )
      .filter(([, text]) => Object.keys(text).length > 0),
  ) as Texts;
}

export function cleanAuthorizationContent(content: AuthorizationContent): AuthorizationContent {
  return {
    title: cleanText(content.title),
    sections: content.sections.map((section) => ({
      key: section.key,
      title: cleanText(section.title),
      body: cleanText(section.body),
    })),
    // Places renumbered 0..n in the order shown.
    consents: Object.fromEntries(
      orderedConsents(content).map((consent, position) => [
        consent.key,
        { label: cleanText(consent.label), required: consent.required, position },
      ]),
    ),
    // The Health screen asks fields since RAPP-698: a new version has no questions.
    texts: cleanTexts(content.texts),
    attachments: content.attachments.map((attachment) => ({
      label: cleanText(attachment.label),
      url: attachment.url.trim(),
    })),
    ...(content.screen_order === undefined ? {} : { screen_order: content.screen_order }),
  };
}

type Status =
  'idle' | 'saving' | 'saved' | 'discarded' | 'publishing' | 'published' | 'invalid' | 'failed';

export interface AuthorizationEditorProps {
  /** The screen of the board being edited (RAPP-696). */
  readonly step: AuthorizationPhoneStep;
  readonly versions: readonly AuthorizationVersion[];
  /** The organization's seasons: the picker offers the current and future ones (RAPP-694). */
  readonly seasons: readonly Season[];
  /** settings.organization: only an admin decision makes every player sign again. */
  readonly canPublish: boolean;
  readonly onSaveDraft: (content: AuthorizationContent) => Promise<void>;
  readonly onDiscardDraft: () => Promise<void>;
  /** Desa: publishes the draft to a season, as a correction or a new version (RAPP-696). */
  readonly onPublish: (seasonId: string, kind: SaveKind) => Promise<number>;
  /** Her onboarding's screens, for the season questions re-registration asks. */
  readonly catalog?: IntakeCatalog;
}

/** Today as an ISO date in the browser's time zone, the way a season's start date is written. */
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function AuthorizationEditor({
  step,
  versions,
  seasons,
  canPublish,
  onSaveDraft,
  onDiscardDraft,
  onPublish,
  catalog = EMPTY_INTAKE_CATALOG,
}: AuthorizationEditorProps) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const draft = versions.find((version) => version.publishedAt === null) ?? null;
  const published = versions.filter((version) => version.publishedAt !== null);
  const current = published.find((version) => version.isCurrent) ?? null;
  const targets = publishableSeasons(seasons, todayIsoDate());
  // The current season by default; with none, the nearest future season.
  const [chosenSeasonId, setChosenSeasonId] = useState<string | null>(null);
  const target = targets.find((season) => season.id === chosenSeasonId) ?? targets[0] ?? null;
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  // What is saved, to compare with what is typed (RAPP-751).
  const [savedContent, setSavedContent] = useState<AuthorizationContent>(
    draft?.content ?? current?.content ?? EMPTY_CONTENT,
  );
  const [typedContent, setContent] = useState<AuthorizationContent>(savedContent);
  // Its consents as the consents screen holds them now (RAPP-699): the phone
  // shows them and the draft takes them.
  const content: AuthorizationContent = {
    ...typedContent,
    consents: authorizationConsentsFromCatalog(catalog),
  };
  // A change is a text, or the consents as the consents screen now places them.
  const isDirty = !isSameContent(content, savedContent);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  // Anyone who signed the target season's versions makes Desa ask (RAPP-696).
  const saveKind = useSaveKind({
    hasAnswers: published.some(
      (version) => version.seasonId === target?.id && version.signatureCount > 0,
    ),
  });
  const direction = getLanguageDirection(language);
  const isBusy = status === 'saving' || status === 'publishing';

  // Its consents come from the consents screen, which translates them there.
  const ownTexts = (each: AuthorizationContent) =>
    Object.fromEntries(Object.entries(each).filter(([key]) => key !== 'consents'));
  const edit = (next: AuthorizationContent) => {
    setContent(next);
    setStatus('idle');
  };
  const inLanguage = (text: AuthorizationText | undefined) => text?.[language] ?? '';
  const withLanguage = (text: AuthorizationText | undefined, value: string): AuthorizationText => ({
    ...text,
    [language]: value,
  });
  // Her phone names the season the draft is published to.
  const seasonName =
    target?.name ?? seasons.find((season) => season.isCurrent)?.name ?? PREVIEW_SEASON;
  /** The app's own text for a field, as staff write it: `{{season}}` stays a placeholder. */
  const bundled = (field: AuthorizationTextField, shownLanguage: LanguageCode) =>
    t(`onboarding:${AUTHORIZATION_BUNDLED_TEXT_KEYS.texts[field]}`, {
      lng: shownLanguage,
      season: '{{season}}',
    });
  // What her phone shows (RAPP-710): what is typed or saved, else the app's own text.
  const shownText = (field: AuthorizationTextField, shownLanguage: LanguageCode) =>
    content.texts[field]?.[shownLanguage] ?? bundled(field, shownLanguage);
  const isEmptyRequired = (field: AuthorizationTextField, shownLanguage: LanguageCode) =>
    !isOptionalAuthorizationTextField(field) && shownText(field, shownLanguage).trim() === '';
  const emptyRequiredLanguage = SUPPORTED_LANGUAGES.find((each) =>
    AUTHORIZATION_TEXT_FIELDS.texts.some((field) => isEmptyRequired(field, each)),
  );

  async function run(next: Status, action: () => Promise<unknown>, done: Status) {
    setStatus(next);
    try {
      await action();
      setStatus(done);
      setSavedContent(typedContent);
    } catch {
      setStatus('failed');
    }
  }

  function parsedContent(): AuthorizationContent | null {
    // A required text cannot be saved empty: the form turns to its language.
    if (emptyRequiredLanguage !== undefined) {
      setLanguage(emptyRequiredLanguage);
      setStatus('invalid');
      return null;
    }
    // A language that still reads as the app's text stays unwritten, so it follows the app.
    const texts = Object.fromEntries(
      AUTHORIZATION_TEXT_FIELDS.texts.flatMap((field) => {
        const typed = content.texts[field];
        const text =
          typed === undefined
            ? undefined
            : staffTextToSave(
                typed,
                (each) => bundled(field, each),
                isOptionalAuthorizationTextField(field),
              );
        return text === undefined ? [] : [[field, text]];
      }),
    ) as AuthorizationContent['texts'];
    const parsed = authorizationContentSchema.safeParse(
      cleanAuthorizationContent({ ...content, texts }),
    );
    if (!parsed.success) setStatus('invalid');
    return parsed.success ? parsed.data : null;
  }

  async function saveDraft() {
    const parsed = parsedContent();
    if (parsed !== null) await run('saving', () => onSaveDraft(parsed), 'saved');
  }

  // Desa (RAPP-696): the draft as typed, published to the chosen season.
  async function save() {
    const parsed = parsedContent();
    if (parsed === null || target === null) return;
    setStatus('saving');
    try {
      await onSaveDraft(parsed);
    } catch {
      setStatus('failed');
      return;
    }
    setStatus('idle');
    await saveKind.request((kind) =>
      run('publishing', () => onPublish(target.id, kind), 'published'),
    );
  }

  // Her phone on this screen, worded as typed.
  const { content: phoneContent, ...position } = authorizationPhoneScreen(
    content,
    step,
    previewLanguage,
    t,
    { seasonName, catalog },
  );
  const isOn = (...steps: readonly AuthorizationPhoneStep[]) => steps.includes(step);
  const canSave = draft !== null || isDirty;

  return (
    <div className="flex flex-col gap-6" data-testid="authorization-editor">
      {saveKind.dialog}
      <EditorColumns
        translatable={{
          texts: () => changedCatalanTexts(ownTexts(typedContent), ownTexts(savedContent)),
          apply: (target, drafts) =>
            edit({
              ...withCatalanDrafts(typedContent, ownTexts(savedContent), target, drafts),
              consents: typedContent.consents,
            }),
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
              {isOn('document') ? (
                <AdminAuthField
                  id="authorization-title"
                  label={t('authorizationDocumentTitle')}
                  dir={direction}
                  value={inLanguage(content.title)}
                  onChange={(event) =>
                    edit({ ...content, title: withLanguage(content.title, event.target.value) })
                  }
                />
              ) : null}

              {isOn('document') ? (
                <fieldset className="flex flex-col gap-4">
                  <legend className="text-start text-sm font-semibold">
                    {t('authorizationSections')}
                  </legend>
                  {content.sections.map((section, index) => (
                    <div key={section.key} className="flex flex-col gap-2 rounded-lg border p-3">
                      <AdminAuthField
                        id={`authorization-section-title-${index}`}
                        label={t('authorizationSectionTitle', { number: index + 1 })}
                        dir={direction}
                        value={inLanguage(section.title)}
                        onChange={(event) =>
                          edit({
                            ...content,
                            sections: content.sections.map((entry, at) =>
                              at === index
                                ? { ...entry, title: withLanguage(entry.title, event.target.value) }
                                : entry,
                            ),
                          })
                        }
                      />
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        <span>{t('authorizationSectionBody')}</span>
                        <Textarea
                          id={`authorization-section-body-${index}`}
                          rows={5}
                          dir={direction}
                          value={inLanguage(section.body)}
                          onChange={(event) =>
                            edit({
                              ...content,
                              sections: content.sections.map((entry, at) =>
                                at === index
                                  ? { ...entry, body: withLanguage(entry.body, event.target.value) }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </label>
                      {content.sections.length > 1 ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-fit"
                          onClick={() =>
                            edit({
                              ...content,
                              sections: content.sections.filter((_, at) => at !== index),
                            })
                          }
                        >
                          {t('authorizationRemoveSection')}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    onClick={() => {
                      const used = new Set(content.sections.map((section) => section.key));
                      let number = content.sections.length + 1;
                      while (used.has(`section_${number}`)) number += 1;
                      edit({
                        ...content,
                        sections: [
                          ...content.sections,
                          { key: `section_${number}`, title: {}, body: {} },
                        ],
                      });
                    }}
                  >
                    {t('authorizationAddSection')}
                  </Button>
                </fieldset>
              ) : null}

              <fieldset className="flex flex-col gap-3" data-testid="authorization-texts">
                <legend className="text-start text-sm font-semibold">
                  {t('authorizationEditor.textsTitle')}
                </legend>
                <p className="text-start text-xs text-muted-foreground">
                  {t('authorizationEditor.textsIntro')}
                </p>
                {AUTHORIZATION_TEXT_FIELDS.texts
                  .filter((field) => AUTHORIZATION_FIELD_STEP[field] === step)
                  .map((field) => (
                    <AdminAuthField
                      key={field}
                      id={`authorization-text-${field}`}
                      label={t(`authorizationEditor.textField.${field}`)}
                      dir={direction}
                      value={shownText(field, language)}
                      errorMessage={
                        isEmptyRequired(field, language)
                          ? t('builtinScreens.requiredText')
                          : undefined
                      }
                      onChange={(event) =>
                        edit({
                          ...content,
                          texts: {
                            ...content.texts,
                            [field]: withLanguage(content.texts[field], event.target.value),
                          },
                        })
                      }
                    />
                  ))}
              </fieldset>

              {isOn('document') ? (
                <fieldset className="flex flex-col gap-3">
                  <legend className="text-start text-sm font-semibold">
                    {t('authorizationAttachments')}
                  </legend>
                  {content.attachments.map((attachment, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-2">
                      <AdminAuthField
                        id={`authorization-attachment-label-${index}`}
                        label={t('authorizationAttachmentLabel')}
                        dir={direction}
                        value={inLanguage(attachment.label)}
                        onChange={(event) =>
                          edit({
                            ...content,
                            attachments: content.attachments.map((entry, at) =>
                              at === index
                                ? { ...entry, label: withLanguage(entry.label, event.target.value) }
                                : entry,
                            ),
                          })
                        }
                      />
                      <AdminAuthField
                        id={`authorization-attachment-url-${index}`}
                        label={t('authorizationAttachmentUrl')}
                        type="url"
                        value={attachment.url}
                        onChange={(event) =>
                          edit({
                            ...content,
                            attachments: content.attachments.map((entry, at) =>
                              at === index ? { ...entry, url: event.target.value } : entry,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    onClick={() =>
                      edit({
                        ...content,
                        attachments: [...content.attachments, { label: {}, url: 'https://' }],
                      })
                    }
                  >
                    {t('authorizationAddAttachment')}
                  </Button>
                </fieldset>
              ) : null}
            </section>

            {isOn('consents') ? (
              // The consents of Dades legals asked here, with the shared picker (RAPP-699).
              <ScreenFieldsSection
                surface="consents"
                catalog={catalog}
                screenKey="consents"
                screenName={t('authorizationEditor.phoneStep.consents')}
                builtinQuestions={[]}
                language={language}
                editing={editingField}
                onEdit={setEditingField}
                onBuiltinLabelChange={() => undefined}
                onWordingChange={() => undefined}
              />
            ) : null}

            {isOn('health') ? (
              // The Health screen's fields, placed with the field picker like any screen's (RAPP-698).
              <ScreenFieldsSection
                surface="authorization"
                catalog={catalog}
                screenKey="health"
                screenName={t('authorizationEditor.phoneStep.health')}
                builtinQuestions={[]}
                language={language}
                editing={editingField}
                onEdit={setEditingField}
                onBuiltinLabelChange={() => undefined}
                onWordingChange={() => undefined}
              />
            ) : null}

            <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
              {canPublish ? (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  <span>{t('authorizationPublishSeason')}</span>
                  <Select
                    value={target?.id ?? ''}
                    disabled={targets.length === 0 || isBusy}
                    onValueChange={(value) => {
                      setChosenSeasonId(value);
                    }}
                  >
                    <SelectTrigger
                      id="authorization-publish-season"
                      className="w-full max-w-xs"
                      data-testid="authorization-publish-season"
                    >
                      <SelectValue placeholder={t('authorizationNoSeasonToPublish')} />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((season) => (
                        <SelectItem
                          key={season.id}
                          value={season.id}
                          data-testid={`authorization-publish-season-${season.id}`}
                        >
                          {season.isCurrent
                            ? t('authorizationPublishSeasonCurrent', { season: season.name })
                            : season.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ) : null}
              {status === 'invalid' ? (
                <p role="alert" className="text-start text-sm text-destructive">
                  {t('authorizationEditor.invalid')}
                </p>
              ) : null}
              {status === 'failed' ? (
                <p role="alert" className="text-start text-sm text-destructive">
                  {t('authorizationPublishFailed')}
                </p>
              ) : null}
              {status === 'saved' || status === 'discarded' || status === 'published' ? (
                <p aria-live="polite" className="text-start text-sm text-muted-foreground">
                  {t(`authorizationEditor.${status}`)}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={canPublish ? 'outline' : 'default'}
                  disabled={isBusy || !isDirty}
                  onClick={() => void saveDraft()}
                  data-testid="authorization-save"
                >
                  {t('authorizationEditor.saveDraft')}
                </Button>
                {draft === null ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => void run('saving', onDiscardDraft, 'discarded')}
                    data-testid="authorization-discard"
                  >
                    {t('authorizationEditor.discardDraft')}
                  </Button>
                )}
                {canPublish ? (
                  <Button
                    type="button"
                    disabled={isBusy || target === null || !canSave}
                    onClick={() => void save()}
                    data-testid="authorization-publish"
                  >
                    {t('saveDialog.save')}
                  </Button>
                ) : null}
              </div>
              {canPublish ? null : (
                <p className="text-start text-sm text-muted-foreground">
                  {t('authorizationEditor.publishNeedsAdmin')}
                </p>
              )}
            </div>
          </>
        }
      />
    </div>
  );
}
