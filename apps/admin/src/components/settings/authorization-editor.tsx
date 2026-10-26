/**
 * The participation authorization, per season (RAPP-304), fully editable
 * (RAPP-614): the published versions, one draft, and a live preview of what a
 * player reads and answers.
 *
 * Staff edit the draft language by language: the document (title, sections,
 * season documents), the consents (add, remove, reorder, reword, mark
 * required), the health question and the emergency contact (asked or not,
 * required or not, their privacy level and wording), and the wording of the
 * form and of re-registration. A wording field left empty shows the app's own
 * text in her language; the preview shows that text and says so. Onboarding
 * designers save and discard the draft; publishing needs
 * settings.organization, because every player signs the new version on her
 * next app open, so the button asks once more before it publishes.
 *
 * A draft is published to a season (RAPP-694): the current one, or a future
 * one the team prepares ahead. A future season's version waits until that
 * season is marked current. The versions list groups by season.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
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
  authorizationWording,
  EMERGENCY_TITLE_REQUIRED_KEY,
  HEALTH_DATA_CONSENT,
  IMAGE_RIGHTS_CONSENT,
  isMiddlePhaseShown,
  newConsentKey,
  orderedConsents,
  type AuthorizationContent,
  type AuthorizationText,
  type AuthorizationVersion,
  type EmergencyContactPrivacy,
} from '@ramassa/shared/authorization';
import {
  getLanguageDirection,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
} from '@ramassa/shared/i18n/languages';
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
  };
}

type Status =
  'idle' | 'saving' | 'saved' | 'discarded' | 'publishing' | 'published' | 'invalid' | 'failed';

export interface AuthorizationEditorProps {
  readonly versions: readonly AuthorizationVersion[];
  /** The organization's seasons: the picker offers the current and future ones (RAPP-694). */
  readonly seasons: readonly Season[];
  /** settings.organization: only an admin decision makes every player sign again. */
  readonly canPublish: boolean;
  readonly onSaveDraft: (content: AuthorizationContent) => Promise<void>;
  readonly onDiscardDraft: () => Promise<void>;
  readonly onPublish: (seasonId: string) => Promise<number>;
}

/** Today as an ISO date in the browser's time zone, the way a season's start date is written. */
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The published versions by season, in the list's order (newest season first). */
function versionsBySeason(published: readonly AuthorizationVersion[]) {
  const groups: { seasonId: string; seasonName: string; versions: AuthorizationVersion[] }[] = [];
  for (const version of published) {
    const seasonId = version.seasonId ?? '';
    const group = groups.find((each) => each.seasonId === seasonId);
    if (group === undefined) {
      groups.push({ seasonId, seasonName: version.seasonName ?? '', versions: [version] });
    } else {
      group.versions.push(version);
    }
  }
  return groups;
}

export function AuthorizationEditor({
  versions,
  seasons,
  canPublish,
  onSaveDraft,
  onDiscardDraft,
  onPublish,
}: AuthorizationEditorProps) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const draft = versions.find((version) => version.publishedAt === null) ?? null;
  const published = versions.filter((version) => version.publishedAt !== null);
  const current = published.find((version) => version.isCurrent) ?? null;
  const currentSeasonId = seasons.find((season) => season.isCurrent)?.id ?? null;
  const targets = publishableSeasons(seasons, todayIsoDate());
  // The current season by default; with none, the nearest future season.
  const [chosenSeasonId, setChosenSeasonId] = useState<string | null>(null);
  const target = targets.find((season) => season.id === chosenSeasonId) ?? targets[0] ?? null;
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [content, setContent] = useState<AuthorizationContent>(
    draft?.content ?? current?.content ?? EMPTY_CONTENT,
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const direction = getLanguageDirection(language);
  const isBusy = status === 'saving' || status === 'publishing';

  const edit = (next: AuthorizationContent) => {
    setContent(next);
    setIsConfirming(false);
    setStatus('idle');
  };
  const inLanguage = (text: AuthorizationText | undefined) => text?.[language] ?? '';
  const withLanguage = (text: AuthorizationText | undefined, value: string): AuthorizationText => ({
    ...text,
    [language]: value,
  });
  /** The app's own text for a field in the language being edited. */
  const bundled = (key: string) =>
    t(`onboarding:${key}`, { lng: language, season: PREVIEW_SEASON });

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
    const parsed = authorizationContentSchema.safeParse(cleanAuthorizationContent(content));
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
    if (target === null) return;
    await run('publishing', () => onPublish(target.id), 'published');
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

  return (
    <div className="flex flex-col gap-6" data-testid="authorization-editor">
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <h3 className="text-start text-base font-semibold">{t('authorizationVersionsTitle')}</h3>
        {versions.length === 0 ? (
          <p className="text-start text-sm text-muted-foreground">{t('authorizationNoVersions')}</p>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="authorization-versions">
            {draft === null ? null : (
              <li className="text-start text-sm" data-testid="authorization-draft-row">
                {t('authorizationEditor.draftRow', {
                  date: new Date(draft.updatedAt ?? Date.now()).toLocaleDateString(
                    i18n.resolvedLanguage,
                  ),
                })}
                <span
                  className="ms-2 rounded border border-dashed px-1.5 py-0.5 text-xs"
                  data-testid="authorization-draft-note"
                >
                  {t('draftSeenByTestPlayers')}
                </span>
              </li>
            )}
            {versionsBySeason(published).map((group) => (
              <li
                key={group.seasonId}
                className="flex flex-col gap-1 pt-2"
                data-testid={`authorization-season-${group.seasonId}`}
              >
                <span className="text-start text-sm font-medium">
                  {group.seasonName}
                  {group.seasonId === currentSeasonId ? (
                    <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal">
                      {t('authorizationCurrentSeasonBadge')}
                    </span>
                  ) : null}
                </span>
                <ul className="flex flex-col gap-1 ps-3">
                  {group.versions.map((version) => (
                    <li key={version.id} className="text-start text-sm">
                      {t('authorizationVersionInSeason', {
                        number: version.versionNumber,
                        date: new Date(version.publishedAt ?? '').toLocaleDateString(
                          i18n.resolvedLanguage,
                        ),
                      })}
                      {version.isCurrent ? (
                        <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                          {t('authorizationCurrentBadge')}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-start text-base font-semibold">{t('authorizationEditorTitle')}</h3>
            <p className="text-start text-sm text-muted-foreground">
              {t('authorizationEditor.intro')}
            </p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>{t('authorizationLanguage')}</span>
            <select
              id="authorization-language"
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

          <AdminAuthField
            id="authorization-title"
            label={t('authorizationDocumentTitle')}
            dir={direction}
            value={inLanguage(content.title)}
            onChange={(event) =>
              edit({ ...content, title: withLanguage(content.title, event.target.value) })
            }
          />

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
                  {consents.length > 1 && !(consent.key === HEALTH_DATA_CONSENT && health.asked) ? (
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
            <p id="authorization-hide-note" className="text-start text-xs text-muted-foreground">
              {t('authorizationEditor.hideNote')}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-3" data-testid="authorization-texts">
            <legend className="text-start text-sm font-semibold">
              {t('authorizationEditor.textsTitle')}
            </legend>
            <p className="text-start text-xs text-muted-foreground">
              {t('authorizationEditor.textsIntro')}
            </p>
            {AUTHORIZATION_TEXT_FIELDS.texts.map((field) => (
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

          {canPublish && draft !== null ? (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>{t('authorizationPublishSeason')}</span>
              <Select
                value={target?.id ?? ''}
                disabled={targets.length === 0 || isBusy}
                onValueChange={(value) => {
                  setChosenSeasonId(value);
                  setIsConfirming(false);
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
          {isConfirming && target !== null ? (
            <p role="alert" className="text-start text-sm font-medium">
              {target.isCurrent
                ? t('authorizationPublishConfirm')
                : t('authorizationPublishConfirmFuture', { season: target.name })}
            </p>
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
            {canPublish && draft !== null ? (
              <Button
                type="button"
                variant={isConfirming ? 'destructive' : 'secondary'}
                disabled={isBusy || target === null}
                onClick={() => void publish()}
                data-testid="authorization-publish"
              >
                {isConfirming
                  ? t('authorizationPublishConfirmAction')
                  : t('authorizationPublishAction')}
              </Button>
            ) : null}
          </div>
          {canPublish ? null : (
            <p className="text-start text-sm text-muted-foreground">
              {t('authorizationEditor.publishNeedsAdmin')}
            </p>
          )}
        </section>

        <AuthorizationPreview content={content} language={language} />
      </div>
    </div>
  );
}

/** What she reads, phase by phase, in the chosen language, as her phone shows it. */
function AuthorizationPreview({
  content,
  language,
}: {
  readonly content: AuthorizationContent;
  readonly language: LanguageCode;
}) {
  const { t } = useTranslation(['settings', 'onboarding']);
  const direction = getLanguageDirection(language);
  const app = (key: string) => t(`onboarding:${key}`, { lng: language, season: PREVIEW_SEASON });
  const staffOr = (
    texts: Readonly<Record<string, AuthorizationText | undefined>>,
    field: string,
    key: string,
  ) =>
    (authorizationWording(texts, field, language) ?? app(key)).replace(
      /\{\{\s*season\s*\}\}/gu,
      PREVIEW_SEASON,
    );
  const words = (field: keyof typeof AUTHORIZATION_BUNDLED_TEXT_KEYS.texts) =>
    staffOr(content.texts, field, AUTHORIZATION_BUNDLED_TEXT_KEYS.texts[field]);
  const label = (text: AuthorizationText) =>
    text[language]?.trim() || text.ca?.trim() || Object.values(text).find(Boolean) || '';
  const { health, emergency_contact: emergency } = content.questions;
  const phases = isMiddlePhaseShown(content) ? 3 : 2;
  const appTextFields = AUTHORIZATION_TEXT_FIELDS.texts.filter(
    (field) => authorizationWording(content.texts, field, language) === undefined,
  ).length;
  return (
    <aside
      className="flex flex-col gap-4 rounded-xl border bg-muted/40 p-5"
      aria-label={t('authorizationEditor.previewTitle')}
      data-testid="authorization-preview"
    >
      <h3 className="text-start text-base font-semibold">
        {t('authorizationEditor.previewTitle')}
      </h3>
      {appTextFields === 0 ? null : (
        <p
          className="text-start text-xs text-muted-foreground"
          data-testid="authorization-app-text"
        >
          {t('authorizationEditor.previewAppText', { count: appTextFields })}
        </p>
      )}
      <div
        lang={language}
        dir={direction}
        className="flex flex-col gap-2 rounded-lg border bg-background p-4"
        data-testid="authorization-preview-document"
      >
        <p className="text-start text-xs text-muted-foreground">
          {t('authorizationEditor.previewStep', {
            label: words('flow_label'),
            step: 1,
            total: phases,
          })}
        </p>
        <p className="text-start text-lg font-semibold">{label(content.title)}</p>
        <p className="text-start text-sm">{words('intro')}</p>
        <p className="mt-2 rounded-md bg-primary px-3 py-2 text-center text-sm text-primary-foreground">
          {words('continue_label')}
        </p>
      </div>
      {phases === 3 ? (
        <div
          lang={language}
          dir={direction}
          className="flex flex-col gap-2 rounded-lg border bg-background p-4"
          data-testid="authorization-preview-health"
        >
          <p className="text-start text-xs text-muted-foreground">
            {t('authorizationEditor.previewStep', {
              label: words('flow_label'),
              step: 2,
              total: 3,
            })}
          </p>
          <p className="text-start text-lg font-semibold">{words('health_title')}</p>
          {health.asked ? (
            <>
              <p className="text-start text-sm">
                {staffOr(health.texts, 'question', AUTHORIZATION_BUNDLED_TEXT_KEYS.health.question)}
              </p>
              <p className="text-start text-sm text-muted-foreground">
                {staffOr(health.texts, 'no_label', AUTHORIZATION_BUNDLED_TEXT_KEYS.health.no_label)}{' '}
                ·{' '}
                {staffOr(
                  health.texts,
                  'yes_label',
                  AUTHORIZATION_BUNDLED_TEXT_KEYS.health.yes_label,
                )}
              </p>
            </>
          ) : null}
          {emergency.asked ? (
            <>
              <p className="text-start text-sm font-semibold">
                {staffOr(
                  emergency.texts,
                  'title',
                  emergency.required
                    ? EMERGENCY_TITLE_REQUIRED_KEY
                    : AUTHORIZATION_BUNDLED_TEXT_KEYS.emergency_contact.title,
                )}
              </p>
              {(['name_label', 'relation_label', 'phone_label'] as const).map((field) => (
                <p key={field} className="text-start text-sm text-muted-foreground">
                  {staffOr(
                    emergency.texts,
                    field,
                    AUTHORIZATION_BUNDLED_TEXT_KEYS.emergency_contact[field],
                  )}
                </p>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      <div
        lang={language}
        dir={direction}
        className="flex flex-col gap-2 rounded-lg border bg-background p-4"
        data-testid="authorization-preview-consents"
      >
        <p className="text-start text-xs text-muted-foreground">
          {t('authorizationEditor.previewStep', {
            label: words('flow_label'),
            step: phases,
            total: phases,
          })}
        </p>
        <p className="text-start text-lg font-semibold">{words('consents_title')}</p>
        <ul className="flex flex-col gap-2">
          {orderedConsents(content).map((consent) => (
            <li key={consent.key} className="flex items-start gap-2 text-start text-sm">
              <span
                aria-hidden="true"
                className="mt-0.5 inline-block size-4 shrink-0 rounded border"
              />
              <span>
                {label(consent.label)}
                {consent.required ? (
                  <span className="block font-semibold">{words('required_mark')}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-start text-sm font-semibold">{words('signature_title')}</p>
        <p className="text-start text-sm text-muted-foreground">{words('signature_prompt')}</p>
        <p className="text-start text-sm">{words('cannot_draw_label')}</p>
        <p className="mt-2 rounded-md bg-primary px-3 py-2 text-center text-sm text-primary-foreground">
          {words('sign_and_enter_label')}
        </p>
        <p className="text-start text-xs text-muted-foreground">
          {t('authorizationEditor.previewTablet', { label: words('sign_label') })}
        </p>
      </div>
      <div
        lang={language}
        dir={direction}
        className="flex flex-col gap-2 rounded-lg border bg-background p-4"
        data-testid="authorization-preview-reregistration"
      >
        <p className="text-start text-lg font-semibold">{words('reregistration_title')}</p>
        <p className="text-start text-sm">{words('reregistration_intro')}</p>
        <p className="text-start text-sm text-muted-foreground">
          {words('reregistration_correct_label')} · {words('reregistration_edit_label')}
        </p>
        <p className="text-start text-sm">{words('reregistration_season_intro')}</p>
      </div>
    </aside>
  );
}
