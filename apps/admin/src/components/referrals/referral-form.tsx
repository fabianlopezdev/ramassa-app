/**
 * The referral an entity sends (RAPP-54, RAPP-303), drawn from the fields
 * staff placed on the form (RAPP-652): their order, their wording for the
 * entity, required or not. Her names are always on it. Every answer travels
 * by field id, the app's fields and Ramassà's alike (RAPP-664), in one call,
 * and the database checks every required field again. A local Spanish phone
 * (612...) is sent with +34; a phone the field refuses says so before
 * anything is sent.
 */

import {
  customAnswerErrorsOf,
  readCustomAnswersOf,
} from '@/components/intake/custom-answer-fields';
import { Page } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  appAnswersFromForm,
  EMPTY_INTAKE_CATALOG,
  entityFormItemsOf,
  entityFormQuestions,
  fetchSystemFieldIndex,
  internationalPhone,
  PHONE_PATTERN,
  requiredEntityFormFieldsLeftEmpty,
  systemFieldsOf,
  type IntakeCatalog,
  type SystemFieldIndex,
} from '@ramassa/shared/intake-builder';
import {
  createReferralSchemaFor,
  referralAppAnswers,
  sendReferral,
  type CreateReferral,
  type CreateReferralInput,
} from '@ramassa/shared/referrals';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { ReferralFormFields } from './referral-form-fields';

const FIELD_PREFIX = 'referral-field';

/** What a new referral starts from. */
export const EMPTY_REFERRAL: CreateReferralInput = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  documentationStatus: 'in_progress',
  notes: '',
  dateOfBirth: '',
  nationality: '',
  documentType: '' as never,
  documentNumber: '',
  city: '',
  applicantStatus: '' as never,
  supportingEntities: [],
  referenceContactName: '',
  seasonNumber: '' as never,
  childcareNeed: '' as never,
  specificNeeds: '',
  consentConfirmed: false as never,
};

/**
 * What the form holds, by field id, to tell a required field left empty
 * (RAPP-664): the app's fields as their answers, her names under their
 * fields' ids.
 */
function formAnswers(
  fields: SystemFieldIndex,
  values: Partial<CreateReferralInput>,
): Record<string, unknown> {
  const answers: Record<string, unknown> = appAnswersFromForm(fields, {
    phone: values.phone,
    dateOfBirth: values.dateOfBirth,
    nationality: values.nationality,
    documentType: values.documentType ?? '',
    documentNumber: values.documentNumber,
    city: values.city,
    referenceContactName: values.referenceContactName,
    applicantStatus: values.applicantStatus ?? '',
    supportingEntities: values.supportingEntities,
    childcareNeed: values.childcareNeed ?? '',
    specificNeeds: values.specificNeeds,
  });
  const names = { first_name: values.firstName, last_name: values.lastName } as const;
  for (const [key, value] of Object.entries(names)) {
    const field = fields.get(key as keyof typeof names);
    if (field !== undefined) answers[field.id] = value;
  }
  return answers;
}

/** A phone she typed that the field refuses, even with +34 in front of a local number. */
function isRefusedPhone(phone: string | undefined): boolean {
  return (phone ?? '').trim() !== '' && !PHONE_PATTERN.test(internationalPhone(phone ?? ''));
}

/** "Other" entities typed as a comma-separated list join the ticked ones. */
function withTypedEntities(referral: CreateReferral, typed: string): CreateReferral {
  const names = typed
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return {
    ...referral,
    supportingEntities: [...new Set([...referral.supportingEntities, ...names])],
  };
}

export interface ReferralFormProps {
  /** The organization's partner entities, offered as other supporting entities (RAPP-303). */
  readonly entityNames?: readonly string[];
  /** The Fitxa fields staff placed on this form (RAPP-652). */
  readonly catalog?: IntakeCatalog;
}

export function ReferralForm({
  entityNames = [],
  catalog = EMPTY_INTAKE_CATALOG,
}: ReferralFormProps) {
  const items = entityFormItemsOf(catalog);
  const questions = entityFormQuestions(items);
  const fields = systemFieldsOf(catalog);
  const formRef = useRef<HTMLFormElement>(null);
  const { t, i18n } = useTranslation(['referrals', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const [otherEntities, setOtherEntities] = useState('');
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  // Each Ramassà answer that does not fit its field, in her wizard's words (RAPP-610).
  const [customErrors, setCustomErrors] = useState<Readonly<Record<string, string>>>({});
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const {
    control,
    handleSubmit,
    watch,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateReferralInput, unknown, CreateReferral>({
    resolver: zodResolver(createReferralSchemaFor(fields)),
    defaultValues: EMPTY_REFERRAL,
  });
  const documentType = watch('documentType') as string | null | undefined;

  /** Reads the field answers and shows what is missing or does not fit; null while any is. */
  function checkedFieldAnswers() {
    const answers =
      formRef.current === null
        ? {}
        : readCustomAnswersOf(new FormData(formRef.current), questions, FIELD_PREFIX);
    const fieldErrors = customAnswerErrorsOf(questions, answers, t);
    const values = getValues();
    const empty = new Set(
      requiredEntityFormFieldsLeftEmpty(items, {
        ...answers,
        ...formAnswers(fields, {
          ...values,
          supportingEntities: withTypedEntities(values as CreateReferral, otherEntities)
            .supportingEntities,
        }),
      }),
    );
    setCustomErrors(fieldErrors);
    setMissing(empty);
    return Object.keys(fieldErrors).length === 0 && empty.size === 0 ? answers : null;
  }

  const submit = handleSubmit(async (parsed) => {
    setFailed(false);
    // Nothing is sent while a field is missing or does not fit.
    const answers = checkedFieldAnswers();
    // The phone field takes an international number; a local Spanish one gets +34.
    if (isRefusedPhone(parsed.phone ?? undefined)) {
      setError('phone', { type: 'format' });
      return;
    }
    if (answers === null) return;
    const referral = withTypedEntities(parsed, otherEntities);
    const result = await safeAsync(
      async () => {
        const known = fields.size === 0 ? await fetchSystemFieldIndex(supabase) : fields;
        return sendReferral(supabase, referral, {
          ...answers,
          ...referralAppAnswers(known, referral),
        });
      },
      { context: { operation: 'entity-referral-create' } },
    );
    if (!result.ok) {
      setFailed(true);
      return;
    }
    await navigate({
      to: '/portal/referrals/$referralId',
      params: { referralId: result.value },
    });
  });

  return (
    <Page>
      <header>
        <Link
          to="/portal/referrals"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('back')}
        </Link>
        <h1 className="mt-3 text-start text-2xl font-semibold">{t('formTitle')}</h1>
        <p className="mt-1 text-start text-sm text-muted-foreground">{t('formIntro')}</p>
      </header>
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          // Every message shows at once, the field answers' too.
          checkedFieldAnswers();
          void submit(event);
        }}
        data-testid="referral-form"
      >
        <ReferralFormFields
          items={items}
          control={control}
          errors={errors}
          language={language}
          idPrefix="referral"
          entityNames={entityNames}
          otherEntities={otherEntities}
          onOtherEntitiesChange={setOtherEntities}
          documentType={documentType}
          customErrors={customErrors}
          missing={missing}
        />
        {failed ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t('saveError')}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={isSubmitting} data-testid="referral-submit">
          {t('save')}
        </Button>
      </form>
    </Page>
  );
}
