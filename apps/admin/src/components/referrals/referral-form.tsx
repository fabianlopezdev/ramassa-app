/**
 * The referral an entity sends (RAPP-54, RAPP-303), drawn from the fields
 * staff placed on the form (RAPP-652): their order, their wording for the
 * entity, required or not. Her names are always on it. The answers to
 * Ramassà's own fields travel with the referral in one call, and the
 * database checks every required field again.
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
  EMPTY_INTAKE_CATALOG,
  entityFormItemsOf,
  entityFormQuestions,
  missingEntityFormFields,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import {
  createReferral,
  createReferralSchema,
  referralSystemValues,
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
    formState: { errors, isSubmitting },
  } = useForm<CreateReferralInput, unknown, CreateReferral>({
    resolver: zodResolver(createReferralSchema),
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
      missingEntityFormFields(
        items,
        referralSystemValues({
          ...values,
          supportingEntities: withTypedEntities(values as CreateReferral, otherEntities)
            .supportingEntities,
        }),
        answers,
      ),
    );
    setCustomErrors(fieldErrors);
    setMissing(empty);
    return Object.keys(fieldErrors).length === 0 && empty.size === 0 ? answers : null;
  }

  const submit = handleSubmit(async (parsed) => {
    setFailed(false);
    // Nothing is sent while a field is missing or does not fit.
    const answers = checkedFieldAnswers();
    if (answers === null) return;
    const result = await safeAsync(
      () => createReferral(supabase, withTypedEntities(parsed, otherEntities), answers),
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
