/**
 * The referral an entity sends (RAPP-54, RAPP-303), drawn from the fields
 * staff placed on the form (RAPP-652): their order, their wording for the
 * entity, required or not. Her names are always on it. Every answer travels
 * by field id, the app's fields and Ramassà's alike (RAPP-664), in one call,
 * and the database checks every required field again. A local Spanish phone
 * (612...) is sent with +34; a phone the field refuses says so before
 * anything is sent. The person from the entity signs each signature block of
 * the form (RAPP-690); the referral goes only once every block is signed.
 *
 * The entity walks it screen by screen (RAPP-938), the way a player walks a
 * form: each screen's title, intro and help, its fields, and Continua once
 * what it asks is complete. The referral's own fields close the last screen,
 * which sends it. Every screen stays in the form while hidden, so nothing
 * typed is lost going back and forth; one call still sends it all.
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
import { useRef, useState, type ReactNode } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  appAnswersFromForm,
  EMPTY_INTAKE_CATALOG,
  entityFormBlocksOf,
  entityFormItemsOf,
  entityFormPages,
  entityFormQuestions,
  fetchSystemFieldIndex,
  formScreenTextsIn,
  formSignaturesPayload,
  internationalPhone,
  PHONE_PATTERN,
  requiredEntityFormFieldsLeftEmpty,
  systemFieldsOf,
  textIn,
  unsignedFormBlocks,
  type EntityFormItem,
  type EntityFormPage,
  type FormSignatureDrafts,
  type IntakeCatalog,
  type SignatureFormBlock,
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

/** The form's own names of an app field of the referral, to check one screen at a time. */
const BUILTIN_VALUES: Readonly<Record<string, readonly (keyof CreateReferralInput)[]>> = {
  first_name: ['firstName'],
  last_name: ['lastName'],
  phone: ['phone'],
  date_of_birth: ['dateOfBirth'],
  nationality: ['nationality'],
  city: ['city'],
  document: ['documentType', 'documentNumber'],
  applicant_status: ['applicantStatus'],
  supporting_entities: ['supportingEntities'],
  reference_contact_name: ['referenceContactName'],
  childcare_need: ['childcareNeed'],
  specific_needs: ['specificNeeds'],
};

/** The referral's own fields, which close the last screen. */
const OWN_VALUES: readonly (keyof CreateReferralInput)[] = [
  'email',
  'documentationStatus',
  'seasonNumber',
  'notes',
  'consentConfirmed',
];

function valuesOf(items: readonly EntityFormItem[]): (keyof CreateReferralInput)[] {
  return items.flatMap((item) => (item.kind === 'builtin' ? (BUILTIN_VALUES[item.key] ?? []) : []));
}

/** What one screen asks that is left out or does not fit. */
interface PageProblems {
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly empty: ReadonlySet<string>;
  readonly notSigned: ReadonlySet<string>;
}

function hasProblem(
  page: EntityFormPage,
  problems: PageProblems,
  errors: FieldErrors<CreateReferralInput>,
  isLast: boolean,
): boolean {
  return (
    page.items.some(
      (item) =>
        problems.empty.has(item.field.id) || problems.fieldErrors[item.field.id] !== undefined,
    ) ||
    page.blocks.some((block) => problems.notSigned.has(block.id)) ||
    [...valuesOf(page.items), ...(isLast ? OWN_VALUES : [])].some(
      (name) => errors[name] !== undefined,
    )
  );
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
  // The entity form holds signature blocks only (RAPP-770).
  const blocks = entityFormBlocksOf(catalog);
  const pages = entityFormPages(catalog, items, blocks);
  const [pageIndex, setPageIndex] = useState(0);
  const lastPage = pages.length - 1;
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
  const [signatures, setSignatures] = useState<FormSignatureDrafts>({});
  const [unsigned, setUnsigned] = useState<ReadonlySet<string>>(new Set());
  const {
    control,
    handleSubmit,
    watch,
    getValues,
    setError,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<CreateReferralInput, unknown, CreateReferral>({
    resolver: zodResolver(createReferralSchemaFor(fields)),
    defaultValues: EMPTY_REFERRAL,
  });
  const documentType = watch('documentType') as string | null | undefined;

  /**
   * Reads the field answers and shows what is missing or does not fit in the
   * fields and blocks given (one screen, or the whole form).
   */
  function checkFields(
    scope: readonly EntityFormItem[],
    scopeBlocks: readonly SignatureFormBlock[],
  ): PageProblems & { readonly answers: ReturnType<typeof readCustomAnswersOf> } {
    const scopeQuestions = entityFormQuestions(scope);
    const answers =
      formRef.current === null
        ? {}
        : readCustomAnswersOf(new FormData(formRef.current), questions, FIELD_PREFIX);
    const fieldErrors = customAnswerErrorsOf(scopeQuestions, answers, t);
    const values = getValues();
    const empty = new Set(
      requiredEntityFormFieldsLeftEmpty(scope, {
        ...answers,
        ...formAnswers(fields, {
          ...values,
          supportingEntities: withTypedEntities(values as CreateReferral, otherEntities)
            .supportingEntities,
        }),
      }),
    );
    const notSigned = new Set(unsignedFormBlocks(scopeBlocks, signatures));
    setCustomErrors(fieldErrors);
    setMissing(empty);
    setUnsigned(notSigned);
    return { answers, fieldErrors, empty, notSigned };
  }

  function isComplete(problems: PageProblems): boolean {
    return (
      Object.keys(problems.fieldErrors).length === 0 &&
      problems.empty.size === 0 &&
      problems.notSigned.size === 0
    );
  }

  /** Opens the first screen with something to complete. */
  function showFirstProblem(problems: PageProblems, formErrors: FieldErrors<CreateReferralInput>) {
    const at = pages.findIndex((page, index) =>
      hasProblem(page, problems, formErrors, index === lastPage),
    );
    if (at >= 0) setPageIndex(at);
  }

  /** Continua: the next screen once this one is complete. */
  async function continueFrom(index: number) {
    const page = pages[index];
    if (page === undefined) return;
    const problems = checkFields(page.items, page.blocks);
    const names = valuesOf(page.items);
    const fits = names.length === 0 ? true : await trigger(names);
    const asksPhone = page.items.some((item) => item.kind === 'builtin' && item.key === 'phone');
    if (asksPhone && isRefusedPhone(getValues('phone') ?? undefined)) {
      setError('phone', { type: 'format' });
      return;
    }
    if (!fits || !isComplete(problems)) return;
    setPageIndex(index + 1);
    window.scrollTo({ top: 0 });
  }

  const submit = handleSubmit(
    async (parsed) => {
      setFailed(false);
      // Nothing is sent while a field is missing or does not fit.
      const checked = checkFields(items, blocks);
      // The phone field takes an international number; a local Spanish one gets +34.
      if (isRefusedPhone(parsed.phone ?? undefined)) {
        setError('phone', { type: 'format' });
        showFirstProblem(checked, { phone: { type: 'format' } });
        return;
      }
      if (!isComplete(checked)) {
        showFirstProblem(checked, {});
        return;
      }
      const answers = checked.answers;
      const referral = withTypedEntities(parsed, otherEntities);
      const result = await safeAsync(
        async () => {
          const known = fields.size === 0 ? await fetchSystemFieldIndex(supabase) : fields;
          return sendReferral(
            supabase,
            referral,
            { ...answers, ...referralAppAnswers(known, referral) },
            formSignaturesPayload(blocks, signatures, language),
          );
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
    },
    (formErrors) => {
      // A field the form refuses: every message shows, and its screen opens.
      showFirstProblem(checkFields(items, blocks), formErrors);
    },
  );

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
          // Every message shows at once, the field answers' too; the first
          // screen with something to complete opens.
          void submit(event);
        }}
        data-testid="referral-form"
      >
        {pages.map((page, index) => (
          <section
            key={page.screen?.id ?? 'form'}
            hidden={index !== pageIndex}
            className="flex flex-col gap-4"
            data-testid={`referral-screen-${index + 1}`}
          >
            {page.screen === null ? null : (
              <ScreenHeading
                title={textIn(page.screen.title, language)}
                intro={page.screen.intro === null ? '' : textIn(page.screen.intro, language)}
                help={formScreenTextsIn(page.screen.texts, language).help}
                step={
                  pages.length > 1
                    ? t('onboarding:stepOf', { current: index + 1, total: pages.length })
                    : null
                }
              />
            )}
            <ReferralFormFields
              items={page.items}
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
              blocks={page.blocks}
              signatures={signatures}
              onSignatureChange={(blockId, strokes) => {
                setSignatures((current) => ({ ...current, [blockId]: strokes }));
                if (strokes !== null) {
                  setUnsigned((current) => new Set([...current].filter((id) => id !== blockId)));
                }
              }}
              unsigned={unsigned}
              asksOwnFields={index === lastPage}
            />
          </section>
        ))}
        {failed ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t('saveError')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {pageIndex === 0 ? null : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                setPageIndex(pageIndex - 1);
                window.scrollTo({ top: 0 });
              }}
              data-testid="referral-previous"
            >
              {t('common:back')}
            </Button>
          )}
          {/* Keyed apart: the Continua just pressed is never reused as the send button, which the click would then press. */}
          {pageIndex < lastPage ? (
            <Button
              key="continue"
              type="button"
              size="lg"
              onClick={() => void continueFrom(pageIndex)}
              data-testid="referral-continue"
            >
              {continueLabelOf(pages[pageIndex], language) ?? t('onboarding:continueAction')}
            </Button>
          ) : (
            <Button
              key="submit"
              type="submit"
              size="lg"
              disabled={isSubmitting}
              data-testid="referral-submit"
            >
              {continueLabelOf(pages[pageIndex], language) ?? t('save')}
            </Button>
          )}
        </div>
      </form>
    </Page>
  );
}

/** The button label staff wrote for a screen; null shows the portal's own. */
function continueLabelOf(page: EntityFormPage | undefined, language: LanguageCode): string | null {
  return page?.screen == null ? null : formScreenTextsIn(page.screen.texts, language).continueLabel;
}

/** A screen's title, with its intro and help when staff wrote them. */
function ScreenHeading({
  title,
  intro,
  help,
  step,
}: {
  readonly title: string;
  readonly intro: string;
  readonly help: string;
  /** "Pas 2 de 3", on a form of more than one screen. */
  readonly step: string | null;
}): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      {step === null ? null : <p className="text-start text-sm text-muted-foreground">{step}</p>}
      <h2 className="text-start text-xl font-semibold">{title}</h2>
      {intro === '' ? null : <p className="text-start text-sm whitespace-pre-line">{intro}</p>}
      {help === '' ? null : (
        <p className="text-start text-sm whitespace-pre-line text-muted-foreground">{help}</p>
      )}
    </div>
  );
}
