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
 * season documents), the consents (add, remove, reorder, reword, mark
 * required), the health question and the emergency contact (asked or not,
 * required or not, their privacy level and wording), and the wording of the
 * form and of re-registration. A wording field left empty shows the app's own
 * text in her language, and the phone shows that text. Onboarding
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
import { RequiredSwitch } from '@/components/settings/required-switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AUTHORIZATION_BUNDLED_TEXT_KEYS,
  AUTHORIZATION_TEXT_FIELDS,
  authorizationContentSchema,
  EMERGENCY_TITLE_REQUIRED_KEY,
  HEALTH_DATA_CONSENT,
  IMAGE_RIGHTS_CONSENT,
  newConsentKey,
  orderedConsents,
  type AuthorizationContent,
  type AuthorizationText,
  type AuthorizationVersion,
  type EmergencyContactPrivacy,
  type SaveKind,
} from '@ramassa/shared/authorization';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
import { EMPTY_INTAKE_CATALOG, type IntakeCatalog } from '@ramassa/shared/intake-builder';
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
  questions: {
    health: { asked: true, required: true, privacy: 'health', texts: {} },
    emergency_contact: { asked: true, required: false, privacy: 'personal', texts: {} },
  },
  texts: {},
  attachments: [],
};

/** Empty languages are dropped, so they fall back instead of showing a blank. */
function cleanText(text: AuthorizationText): AuthorizationText {
  return Object.fromEntries(
    Object.entries(text)
      .map(([language, value]) => [language, (value ?? '').trim()] as const)
      .filter(([, value]) => value !== ''),
  );
}

/** Wording overrides: a field with no text in any language is left out. */
function cleanTexts<Texts extends Readonly<Record<string, AuthorizationText | undefined>>>(
  texts: Texts,
): Texts {
  return Object.fromEntries(
    Object.entries(texts)
      .map(([field, text]) => [field, cleanText(text ?? {})] as const)
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
    questions: {
      health: {
        ...content.questions.health,
        texts: cleanTexts(content.questions.health.texts),
      },
      emergency_contact: {
        ...content.questions.emergency_contact,
        texts: cleanTexts(content.questions.emergency_contact.texts),
      },
    },
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
  const [content, setContent] = useState<AuthorizationContent>(
    draft?.content ?? current?.content ?? EMPTY_CONTENT,
  );
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  // Anyone who signed the target season's versions makes Desa ask (RAPP-696).
  const saveKind = useSaveKind({
    hasAnswers: published.some(
      (version) => version.seasonId === target?.id && version.signatureCount > 0,
    ),
  });
  const direction = getLanguageDirection(language);
  const isBusy = status === 'saving' || status === 'publishing';

  const edit = (next: AuthorizationContent) => {
    setContent(next);
    setIsDirty(true);
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
  /** The app's own text for a field in the language being edited. */
  const bundled = (key: string) => t(`onboarding:${key}`, { lng: language, season: seasonName });

  async function run(next: Status, action: () => Promise<unknown>, done: Status) {
    setStatus(next);
    try {
      await action();
      setStatus(done);
      setIsDirty(false);
    } catch {
      setStatus('failed');
    }
  }

  function parsedContent(): AuthorizationContent | null {
    const parsed = authorizationContentSchema.safeParse(cleanAuthorizationContent(content));
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

  const consents = orderedConsents(content);
  const { health, emergency_contact: emergency } = content.questions;
  const setConsents = (next: typeof consents) =>
    edit({
      ...content,
      consents: Object.fromEntries(
        next.map((consent, position) => [
          consent.key,
          { label: consent.label, required: consent.required, position },
        ]),
      ),
    });
  const setHealth = (next: Partial<typeof health>) => {
    const merged = { ...health, ...next };
    const healthConsent = content.consents[HEALTH_DATA_CONSENT];
    edit({
      ...content,
      // A required health question needs its consent required too: set it with it.
      consents:
        merged.required && healthConsent !== undefined
          ? { ...content.consents, [HEALTH_DATA_CONSENT]: { ...healthConsent, required: true } }
          : content.consents,
      questions: { ...content.questions, health: merged },
    });
  };
  const setEmergency = (next: Partial<typeof emergency>) =>
    edit({
      ...content,
      questions: { ...content.questions, emergency_contact: { ...emergency, ...next } },
    });

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
        language={language}
        onLanguageChange={setLanguage}
        previewLanguage={previewLanguage}
        onPreviewLanguageChange={setPreviewLanguage}
        previewLabel={t('onboardingBoard.phone')}
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

              {isOn('consents') ? (
                <fieldset className="flex flex-col gap-3" data-testid="authorization-consents">
                  <legend className="text-start text-sm font-semibold">
                    {t('authorizationEditor.consentsTitle')}
                  </legend>
                  <p className="text-start text-xs text-muted-foreground">
                    {t('authorizationEditor.consentsIntro')}
                  </p>
                  {consents.map((consent, index) => (
                    <div
                      key={consent.key}
                      className="flex flex-col gap-2 rounded-lg border p-3"
                      data-testid={`authorization-consent-${consent.key}`}
                    >
                      <AdminAuthField
                        id={`authorization-consent-label-${consent.key}`}
                        label={t('authorizationEditor.consentLabel', { number: index + 1 })}
                        dir={direction}
                        value={inLanguage(consent.label)}
                        onChange={(event) =>
                          setConsents(
                            consents.map((entry) =>
                              entry.key === consent.key
                                ? { ...entry, label: withLanguage(entry.label, event.target.value) }
                                : entry,
                            ),
                          )
                        }
                      />
                      <RequiredSwitch
                        id={`authorization-consent-required-${consent.key}`}
                        checked={consent.required}
                        disabled={isBusy}
                        lockReason={
                          consent.key === IMAGE_RIGHTS_CONSENT
                            ? t('authorizationEditor.imageRightsLock')
                            : consent.key === HEALTH_DATA_CONSENT && health.asked && health.required
                              ? t('authorizationEditor.healthConsentLock')
                              : undefined
                        }
                        onChange={(required) =>
                          setConsents(
                            consents.map((entry) =>
                              entry.key === consent.key ? { ...entry, required } : entry,
                            ),
                          )
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === 0}
                          aria-label={t('authorizationEditor.moveUp', { number: index + 1 })}
                          onClick={() => {
                            const next = [...consents];
                            [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                            setConsents(next);
                          }}
                        >
                          {t('authorizationEditor.moveUpShort')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === consents.length - 1}
                          aria-label={t('authorizationEditor.moveDown', { number: index + 1 })}
                          onClick={() => {
                            const next = [...consents];
                            [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                            setConsents(next);
                          }}
                        >
                          {t('authorizationEditor.moveDownShort')}
                        </Button>
                        {consents.length > 1 &&
                        !(consent.key === HEALTH_DATA_CONSENT && health.asked) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-testid={`authorization-consent-remove-${consent.key}`}
                            onClick={() =>
                              setConsents(consents.filter((entry) => entry.key !== consent.key))
                            }
                          >
                            {t('authorizationEditor.removeConsent')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {consents.length < 20 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit"
                      data-testid="authorization-consent-add"
                      onClick={() =>
                        setConsents([
                          ...consents,
                          {
                            key: newConsentKey(content),
                            label: {},
                            required: false,
                            position: consents.length,
                          },
                        ])
                      }
                    >
                      {t('authorizationEditor.addConsent')}
                    </Button>
                  ) : null}
                </fieldset>
              ) : null}

              {isOn('health') ? (
                <fieldset className="flex flex-col gap-3" data-testid="authorization-health">
                  <legend className="text-start text-sm font-semibold">
                    {t('authorizationEditor.healthTitle')}
                  </legend>
                  <label className="flex items-center gap-2 text-start text-xs font-medium">
                    <input
                      id="authorization-health-asked"
                      data-testid="authorization-health-asked"
                      type="checkbox"
                      checked={health.asked}
                      disabled={health.required}
                      aria-describedby="authorization-hide-note"
                      onChange={(event) => setHealth({ asked: event.target.checked })}
                    />
                    <span>{t('authorizationEditor.asked')}</span>
                  </label>
                  <RequiredSwitch
                    id="authorization-health-required"
                    checked={health.required}
                    disabled={isBusy || !health.asked}
                    onChange={(required) => setHealth({ required })}
                  />
                  <p className="text-start text-xs text-muted-foreground">
                    {t('authorizationEditor.healthPrivacy')}
                  </p>
                  {AUTHORIZATION_TEXT_FIELDS.health.map((field) => (
                    <AdminAuthField
                      key={field}
                      id={`authorization-health-${field}`}
                      label={t(`authorizationEditor.healthField.${field}`)}
                      dir={direction}
                      placeholder={bundled(AUTHORIZATION_BUNDLED_TEXT_KEYS.health[field])}
                      value={inLanguage(health.texts[field])}
                      onChange={(event) =>
                        setHealth({
                          texts: {
                            ...health.texts,
                            [field]: withLanguage(health.texts[field], event.target.value),
                          },
                        })
                      }
                    />
                  ))}
                </fieldset>
              ) : null}

              {isOn('health') ? (
                <fieldset className="flex flex-col gap-3" data-testid="authorization-emergency">
                  <legend className="text-start text-sm font-semibold">
                    {t('authorizationEditor.emergencyTitle')}
                  </legend>
                  <label className="flex items-center gap-2 text-start text-xs font-medium">
                    <input
                      id="authorization-emergency-asked"
                      data-testid="authorization-emergency-asked"
                      type="checkbox"
                      checked={emergency.asked}
                      disabled={emergency.required}
                      aria-describedby="authorization-hide-note"
                      onChange={(event) => setEmergency({ asked: event.target.checked })}
                    />
                    <span>{t('authorizationEditor.asked')}</span>
                  </label>
                  <RequiredSwitch
                    id="authorization-emergency-required"
                    checked={emergency.required}
                    disabled={isBusy || !emergency.asked}
                    onChange={(required) => setEmergency({ required })}
                  />
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    <span>{t('authorizationEditor.privacy')}</span>
                    <select
                      id="authorization-emergency-privacy"
                      value={emergency.privacy}
                      onChange={(event) =>
                        setEmergency({ privacy: event.target.value as EmergencyContactPrivacy })
                      }
                      className="h-9 max-w-xs rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="personal">{t('questions.privacyLevels.personal')}</option>
                      <option value="sensitive">{t('questions.privacyLevels.sensitive')}</option>
                    </select>
                    <span className="text-xs font-normal text-muted-foreground">
                      {t('authorizationEditor.emergencyPrivacyNote')}
                    </span>
                  </label>
                  {AUTHORIZATION_TEXT_FIELDS.emergency_contact.map((field) => (
                    <AdminAuthField
                      key={field}
                      id={`authorization-emergency-${field}`}
                      label={t(`authorizationEditor.emergencyField.${field}`)}
                      dir={direction}
                      placeholder={bundled(
                        field === 'title' && emergency.required
                          ? EMERGENCY_TITLE_REQUIRED_KEY
                          : AUTHORIZATION_BUNDLED_TEXT_KEYS.emergency_contact[field],
                      )}
                      value={inLanguage(emergency.texts[field])}
                      onChange={(event) =>
                        setEmergency({
                          texts: {
                            ...emergency.texts,
                            [field]: withLanguage(emergency.texts[field], event.target.value),
                          },
                        })
                      }
                    />
                  ))}
                  <p
                    id="authorization-hide-note"
                    className="text-start text-xs text-muted-foreground"
                  >
                    {t('authorizationEditor.hideNote')}
                  </p>
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
                      placeholder={bundled(AUTHORIZATION_BUNDLED_TEXT_KEYS.texts[field])}
                      value={inLanguage(content.texts[field])}
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
                  disabled={isBusy}
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
