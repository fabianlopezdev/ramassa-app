import {
  normalizedServiceMetadata,
  serviceMetadataDefaults,
  ServiceSubmissionFields,
  type ServiceFormValues,
} from '@/components/content/service-submission-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useState, type FormEvent } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { AppErrorCode } from '@ramassa/shared/errors';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import type { AdminServiceCategory } from '@ramassa/shared/services';
import {
  createEntityServiceInputSchema,
  saveEntityService,
  type EntityServiceRow,
  type OwnServiceContact,
} from '@ramassa/shared/services/entity';

interface EntityServiceEditorProps {
  readonly categories: readonly AdminServiceCategory[];
  readonly contacts: readonly OwnServiceContact[];
  readonly service?: EntityServiceRow;
  readonly onSaved: (serviceId: string) => void | Promise<void>;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function localDateTime(value: string | null): string {
  if (value === null) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  return value.length === 0 ? null : new Date(value).toISOString();
}

function normalizedContactSearch(value: string): string {
  return value.normalize('NFKD').replaceAll(/\p{M}/gu, '').toLocaleLowerCase();
}

export function EntityServiceEditor({
  categories,
  contacts,
  service,
  onSaved,
}: EntityServiceEditorProps) {
  const { t, i18n } = useTranslation(['entity-services', 'errors']);
  const firstCategory = categories[0];
  const [categoryId, setCategoryId] = useState(service?.category_id ?? firstCategory?.id ?? '');
  const category = categories.find((item) => item.id === categoryId) ?? firstCategory;
  const [title, setTitle] = useState(service?.title.ca ?? '');
  const [description, setDescription] = useState(service?.description?.ca ?? '');
  const [publishedAt, setPublishedAt] = useState(localDateTime(service?.published_at ?? null));
  const [expiresAt, setExpiresAt] = useState(localDateTime(service?.expires_at ?? null));
  const [contactSuggestionsVisible, setContactSuggestionsVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formInvalid, setFormInvalid] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const form = useForm<ServiceFormValues>({
    defaultValues: {
      providerName: service?.provider_name ?? '',
      location: service?.location ?? '',
      zone: service?.zone ?? '',
      costType: service?.cost_type ?? 'free',
      costAmount: service?.cost_amount === null ? '' : String(service?.cost_amount ?? ''),
      costDetails: service?.cost_details ?? '',
      contactName: service?.contact_name ?? '',
      contactPhone: service?.contact_phone ?? '',
      contactEmail: service?.contact_email ?? '',
      contactRole: service?.contact_role ?? '',
      schedule: service?.schedule ?? '',
      externalUrl: service?.external_url ?? '',
      availability: service?.availability ?? 'available',
      metadata: category === undefined ? {} : serviceMetadataDefaults(category, service?.metadata),
    },
  });
  const contactQuery = form.watch('contactName').trim();
  const contactNameRegistration = form.register('contactName');
  const normalizedQuery = normalizedContactSearch(contactQuery);
  const contactMatches =
    contactQuery.length === 0
      ? []
      : contacts.filter((contact) =>
          [contact.name, contact.email, contact.phone].some((value) =>
            value === null ? false : normalizedContactSearch(value).includes(normalizedQuery),
          ),
        );

  if (category === undefined) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('entity-services:formInvalid')}
      </p>
    );
  }
  const activeCategory = category;

  function changeCategory(nextId: string) {
    setCategoryId(nextId);
    const next = categories.find((item) => item.id === nextId);
    if (next !== undefined) form.setValue('metadata', serviceMetadataDefaults(next));
  }

  function chooseContact(contact: OwnServiceContact) {
    form.setValue('contactName', contact.name ?? '');
    form.setValue('contactPhone', contact.phone ?? '');
    form.setValue('contactEmail', contact.email ?? '');
    form.setValue('contactRole', contact.role ?? '');
    if (contact.providerName !== null) form.setValue('providerName', contact.providerName);
    setContactSuggestionsVisible(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    setFormInvalid(false);
    const values = form.getValues();
    const input = {
      categoryId,
      title,
      description: blankToNull(description),
      providerName: blankToNull(values.providerName),
      location: blankToNull(values.location),
      zone: blankToNull(values.zone),
      costType: values.costType,
      costAmount: values.costAmount.length === 0 ? null : Number(values.costAmount),
      costDetails: blankToNull(values.costDetails),
      contactName: blankToNull(values.contactName),
      contactPhone: blankToNull(values.contactPhone),
      contactEmail: blankToNull(values.contactEmail),
      contactRole: blankToNull(values.contactRole),
      schedule: blankToNull(values.schedule),
      externalUrl: blankToNull(values.externalUrl),
      availability: values.availability,
      metadata: normalizedServiceMetadata(activeCategory, values.metadata),
      publishedAt: toIso(publishedAt),
      expiresAt: toIso(expiresAt),
    };
    if (!createEntityServiceInputSchema(activeCategory).safeParse(input).success) {
      setFormInvalid(true);
      return;
    }

    setIsSaving(true);
    const result = await safeAsync(
      () => saveEntityService(supabase, activeCategory, input, service?.id ?? null),
      { context: { operation: 'entity-service-save' } },
    );
    setIsSaving(false);
    if (!result.ok) setErrorCode(result.error.code);
    else await onSaved(result.value);
  }

  const language = (i18n.resolvedLanguage ?? 'ca') as SupportedLanguage;

  return (
    <FormProvider {...form}>
      <form className="grid gap-6" onSubmit={(event) => void submit(event)}>
        {service?.status === 'published' ? (
          <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            {t('entity-services:publishedEditNotice')}
          </p>
        ) : null}
        <ServiceSubmissionFields
          categories={categories}
          category={activeCategory}
          categoryId={categoryId}
          language={language}
          labelNamespace="entity-services"
          onCategoryChange={changeCategory}
          contactNameField={
            <div className="relative grid gap-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium">{t('entity-services:fieldContactName')}</span>
                <Input
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls={
                    contactSuggestionsVisible && contactQuery.length > 0
                      ? 'entity-service-contact-listbox'
                      : undefined
                  }
                  aria-expanded={contactSuggestionsVisible && contactQuery.length > 0}
                  data-testid="service-contact-name"
                  {...contactNameRegistration}
                  onFocus={() => setContactSuggestionsVisible(true)}
                  onChange={(event) => {
                    void contactNameRegistration.onChange(event);
                    setContactSuggestionsVisible(true);
                  }}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                {t('entity-services:contactReuseHelp')}
              </p>
              {contactSuggestionsVisible && contactQuery.length > 0 ? (
                <div
                  id="entity-service-contact-listbox"
                  role="listbox"
                  className="grid max-h-44 gap-1 overflow-auto rounded-md border bg-popover p-1"
                  data-testid="entity-service-contact-results"
                >
                  {contactMatches.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      {t('entity-services:contactNoMatches')}
                    </p>
                  ) : (
                    contactMatches.map((contact, index) => (
                      <button
                        key={`${contact.email ?? contact.phone ?? contact.name}-${index}`}
                        type="button"
                        role="option"
                        className="rounded px-2 py-1 text-start text-sm hover:bg-muted"
                        data-testid={`entity-service-contact-option-${index}`}
                        onClick={() => chooseContact(contact)}
                      >
                        {contact.name ?? contact.email ?? contact.phone}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          }
        >
          <section className="grid gap-4 rounded-lg border p-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium">{t('entity-services:fieldTitle')}</span>
              <Input
                required
                maxLength={200}
                value={title}
                data-testid="entity-service-title"
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">{t('entity-services:fieldDescription')}</span>
              <Textarea
                required
                maxLength={10_000}
                value={description}
                data-testid="entity-service-description"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </section>
        </ServiceSubmissionFields>
        <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('entity-services:requestedPublishAt')}</span>
            <Input
              type="datetime-local"
              value={publishedAt}
              data-testid="entity-service-published-at"
              onChange={(event) => setPublishedAt(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              {t('entity-services:requestedPublishHelp')}
            </span>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('entity-services:expiresAt')}</span>
            <Input
              type="datetime-local"
              value={expiresAt}
              data-testid="entity-service-expires-at"
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </label>
        </section>
        {formInvalid ? (
          <p role="alert" className="text-sm text-destructive" data-testid="service-form-error">
            {t('entity-services:formInvalid')}
          </p>
        ) : null}
        {errorCode === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors:${errorCode}`)}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="justify-self-start"
          data-testid="entity-service-save"
          disabled={isSaving}
        >
          {isSaving
            ? t('entity-services:saving')
            : service?.status === 'published'
              ? t('entity-services:save')
              : t('entity-services:submit')}
        </Button>
      </form>
    </FormProvider>
  );
}
