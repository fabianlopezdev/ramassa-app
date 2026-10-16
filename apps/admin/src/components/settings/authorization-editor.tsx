/**
 * The participation authorization, per season (RAPP-304): the published
 * versions, and an editor for the next one.
 *
 * The editor starts from the current version. Staff pick a language and edit
 * every text in it: the title, each section, each consent's wording and the
 * season documents (a link each). A language left empty falls back to another
 * one when she reads it. Publishing is final: a published version is never
 * edited, and every player signs the new one on her next app open, so the
 * button asks once more before it publishes.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AUTHORIZATION_CONSENTS,
  authorizationContentSchema,
  type AuthorizationContent,
  type AuthorizationText,
  type AuthorizationVersion,
} from '@ramassa/shared/authorization';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import type { LanguageCode } from '@ramassa/shared/schemas';

const EMPTY_CONTENT: AuthorizationContent = {
  title: { ca: '' },
  sections: [{ key: 'section_1', title: { ca: '' }, body: { ca: '' } }],
  consents: Object.fromEntries(
    AUTHORIZATION_CONSENTS.map((consent) => [
      consent.key,
      { required: consent.required, label: { ca: '' } },
    ]),
  ) as AuthorizationContent['consents'],
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

function cleanContent(content: AuthorizationContent): AuthorizationContent {
  return {
    title: cleanText(content.title),
    sections: content.sections.map((section) => ({
      key: section.key,
      title: cleanText(section.title),
      body: cleanText(section.body),
    })),
    consents: Object.fromEntries(
      Object.entries(content.consents).map(([key, consent]) => [
        key,
        { required: consent.required, label: cleanText(consent.label) },
      ]),
    ) as AuthorizationContent['consents'],
    attachments: content.attachments.map((attachment) => ({
      label: cleanText(attachment.label),
      url: attachment.url.trim(),
    })),
  };
}

export interface AuthorizationEditorProps {
  readonly versions: readonly AuthorizationVersion[];
  readonly onPublish: (content: AuthorizationContent) => Promise<void>;
}

export function AuthorizationEditor({ versions, onPublish }: AuthorizationEditorProps) {
  const { t, i18n } = useTranslation('settings');
  const current = versions.find((version) => version.isCurrent) ?? null;
  const [language, setLanguage] = useState<LanguageCode>(
    (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca',
  );
  const [content, setContent] = useState<AuthorizationContent>(current?.content ?? EMPTY_CONTENT);
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState<'idle' | 'publishing' | 'published' | 'invalid' | 'failed'>(
    'idle',
  );

  const edit = (next: AuthorizationContent) => {
    setContent(next);
    setIsConfirming(false);
    setStatus('idle');
  };
  const inLanguage = (text: AuthorizationText) => text[language] ?? '';
  const withLanguage = (text: AuthorizationText, value: string): AuthorizationText => ({
    ...text,
    [language]: value,
  });

  async function publish() {
    const parsed = authorizationContentSchema.safeParse(cleanContent(content));
    if (!parsed.success) {
      setStatus('invalid');
      setIsConfirming(false);
      return;
    }
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }
    setStatus('publishing');
    try {
      await onPublish(parsed.data);
      setStatus('published');
    } catch {
      setStatus('failed');
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6" data-testid="authorization-editor">
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <h3 className="text-start text-base font-semibold">{t('authorizationVersionsTitle')}</h3>
        {versions.length === 0 ? (
          <p className="text-start text-sm text-muted-foreground">{t('authorizationNoVersions')}</p>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="authorization-versions">
            {versions.map((version) => (
              <li key={version.id} className="text-start text-sm">
                {t('authorizationVersionRow', {
                  season: version.seasonName,
                  number: version.versionNumber,
                  date: new Date(version.publishedAt).toLocaleDateString(i18n.resolvedLanguage),
                })}
                {version.isCurrent ? (
                  <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                    {t('authorizationCurrentBadge')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-start text-base font-semibold">{t('authorizationEditorTitle')}</h3>
          <p className="text-start text-sm text-muted-foreground">
            {t('authorizationEditorIntro')}
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
          value={inLanguage(content.title)}
          onChange={(event) =>
            edit({ ...content, title: withLanguage(content.title, event.target.value) })
          }
        />

        <fieldset className="flex flex-col gap-4">
          <legend className="text-start text-sm font-semibold">{t('authorizationSections')}</legend>
          {content.sections.map((section, index) => (
            <div key={section.key} className="flex flex-col gap-2 rounded-lg border p-3">
              <AdminAuthField
                id={`authorization-section-title-${index}`}
                label={t('authorizationSectionTitle', { number: index + 1 })}
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
                    edit({ ...content, sections: content.sections.filter((_, at) => at !== index) })
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
                sections: [...content.sections, { key: `section_${number}`, title: {}, body: {} }],
              });
            }}
          >
            {t('authorizationAddSection')}
          </Button>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-start text-sm font-semibold">{t('authorizationConsents')}</legend>
          {AUTHORIZATION_CONSENTS.map((consent) => (
            <AdminAuthField
              key={consent.key}
              id={`authorization-consent-${consent.key}`}
              label={`${t(`authorizationConsent.${consent.key}`)}${
                consent.required ? ` (${t('authorizationRequired')})` : ''
              }`}
              value={inLanguage(content.consents[consent.key].label)}
              onChange={(event) =>
                edit({
                  ...content,
                  consents: {
                    ...content.consents,
                    [consent.key]: {
                      ...content.consents[consent.key],
                      label: withLanguage(content.consents[consent.key].label, event.target.value),
                    },
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

        {isConfirming ? (
          <p role="alert" className="text-start text-sm font-medium">
            {t('authorizationPublishConfirm')}
          </p>
        ) : null}
        {status === 'invalid' ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t('authorizationInvalid')}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t('authorizationPublishFailed')}
          </p>
        ) : null}
        {status === 'published' ? (
          <p aria-live="polite" className="text-start text-sm text-muted-foreground">
            {t('authorizationPublished')}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="w-fit"
          disabled={status === 'publishing'}
          onClick={() => void publish()}
          data-testid="authorization-publish"
        >
          {isConfirming ? t('authorizationPublishConfirmAction') : t('authorizationPublishAction')}
        </Button>
      </section>
    </div>
  );
}
