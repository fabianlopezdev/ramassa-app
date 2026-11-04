/**
 * The app terms as a form (RAPP-772): "Condicions de l'app" is the system
 * legal form `app_terms`, built on the board every form uses. Her phone reads
 * it from the version she is shown: the catalog lists its screens, questions,
 * blocks and consents with the other forms'.
 *
 *   - Her Onboarding ends with the summary, then the terms form's screens
 *     (`termsWizardSteps`, `herWizardFlow`), and finishes on its last one.
 *   - What she gave on it travels as one acceptance (`appTermsSubmission`):
 *     the version she was shown, her answers, her ticks and her signatures.
 *     The ledger keeps her acceptance; her signature of the terms' own block
 *     is her signature of it.
 *   - An older server sends the old content only: it reads as the same form
 *     (`appTermsAsForm`), and what she gave travels as the old acceptance.
 *
 * Docs: https://zod.dev/api
 */
import { resolveLocalizedText } from '../i18n/localized-content';
import {
  APP_TERMS_ACCEPTANCE_KEY,
  APP_TERMS_MEDIA_KEY,
  appTermsAsForm,
  LEGACY_TERMS_IDS,
  type AppTermsText,
  type CurrentAppTerms,
} from '../onboarding/app-terms';
import { termsStepKey, type TermsWizardStep, type WizardFlow } from '../onboarding/intake';
import type { LanguageCode } from '../schemas/language';
import { answerPayload, wizardFlow, type IntakeCatalog } from './builder';
import type { CustomForm, CustomFormScreen } from './custom-form-model';
import { UNABLE_TO_DRAW } from './form-blocks';
import { formWalkPayload, type FormWalkDraft } from './form-walk';
import { customFormAskingScreens } from './onboarding-chain';
import { formOpensWhen } from './screen-branches';

/**
 * The text of the terms' own signature, as the migration writes it for an
 * older server's content (`private.app_terms_signature_text`).
 */
export const APP_TERMS_SIGNATURE_TEXT: AppTermsText = {
  ca: "Amb la meva signatura accepto les condicions de l'app.",
  es: 'Con mi firma acepto las condiciones de la aplicación.',
  en: 'With my signature I accept the app terms.',
  ar: 'بتوقيعي أوافق على شروط التطبيق.',
  fa: 'با امضای خود شرایط برنامه را می‌پذیرم.',
};

/** The organization's terms form in the catalog; none from an older server. */
export function appTermsForm(catalog: Pick<IntakeCatalog, 'customForms'>): CustomForm | undefined {
  return (catalog.customForms ?? []).find((form) => form.systemKey === 'app_terms');
}

/** The screen she signs the terms on: the form's locked last screen. */
export function isTermsSignScreen(screen: Pick<CustomFormScreen, 'systemScreen'>): boolean {
  return screen.systemScreen === 'terms_sign';
}

/**
 * Her catalog with the terms form in it: as the server sends it, or for an
 * older server, its old content read as the same form. Unchanged when there
 * are no terms to read.
 */
export function withAppTermsForm(catalog: IntakeCatalog): IntakeCatalog {
  if (appTermsForm(catalog) !== undefined || catalog.terms == null) return catalog;
  const legacy = appTermsAsForm(catalog.terms, APP_TERMS_SIGNATURE_TEXT);
  if (legacy === null) return catalog;
  return {
    ...catalog,
    customForms: [...(catalog.customForms ?? []), legacy.form],
    blocks: [...(catalog.blocks ?? []), ...legacy.blocks],
    consents: [...(catalog.consents ?? []), ...legacy.consents],
    consentPlacements: [...(catalog.consentPlacements ?? []), ...legacy.consentPlacements],
  };
}

/**
 * The terms form's screens as her wizard walks them, in the form's order, each
 * with the conditions that open it; undefined when there is no terms form.
 */
export function termsWizardSteps(catalog: IntakeCatalog): readonly TermsWizardStep[] | undefined {
  const form = appTermsForm(catalog);
  if (form === undefined) return undefined;
  return customFormAskingScreens(catalog, form).map((screen) => ({
    key: termsStepKey(screen.id),
    opensWhen: formOpensWhen(catalog, form, screen) ?? [],
  }));
}

/** Her wizard's flow: the order staff arranged, ending on the terms form's screens. */
export function herWizardFlow(catalog: IntakeCatalog): WizardFlow {
  const termsSteps = termsWizardSteps(catalog);
  return termsSteps === undefined ? wizardFlow(catalog) : { ...wizardFlow(catalog), termsSteps };
}

/** What she sends to accept the terms: the terms form's, or an older server's old acceptance. */
export type AppTermsSubmission =
  | {
      readonly kind: 'form';
      /** `p_signing` of `complete_onboarding_signed`: the version and language she was shown, and what she gave. */
      readonly signing: Readonly<Record<string, unknown>>;
      /** `p_signing` of `accept_current_app_terms`, which takes the version and language apart. */
      readonly acceptance: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: 'legacy';
      readonly termsVersion: string;
      /** The language of the text she read: hers, or Catalan when hers is empty. */
      readonly localeShown: LanguageCode;
      readonly mediaConsent: boolean;
      readonly signing: Readonly<Record<string, unknown>>;
    };

/**
 * What she gave on the terms screens she saw, as she sends it. Null for an
 * older server's terms when her acceptance or her signature is missing: the
 * screens ask her for them first.
 */
export function appTermsSubmission(input: {
  readonly catalog: IntakeCatalog;
  readonly terms: CurrentAppTerms;
  readonly screens: readonly Pick<CustomFormScreen, 'id'>[];
  readonly draft: FormWalkDraft;
  readonly language: LanguageCode;
  readonly device: string;
}): AppTermsSubmission | null {
  const { terms, draft, device } = input;
  if (terms.formId !== null) {
    const payload = formWalkPayload(input.catalog, input.screens, draft, input.language);
    const acceptance = {
      answers: answerPayload(payload.answers),
      consents: payload.consents ?? {},
      signatures: payload.signatures,
      device,
    };
    return {
      kind: 'form',
      signing: { version_id: terms.id, language: payload.language, ...acceptance },
      acceptance,
    };
  }
  const signature = draft.signatures[LEGACY_TERMS_IDS.signatureBlock] ?? null;
  if (draft.consents[APP_TERMS_ACCEPTANCE_KEY] !== true || signature === null) return null;
  const mediaConsent = draft.consents[APP_TERMS_MEDIA_KEY] === true;
  return {
    kind: 'legacy',
    // A test player's draft has no number yet (RAPP-619).
    termsVersion: terms.versionNumber === null ? 'draft' : String(terms.versionNumber),
    localeShown:
      terms.content === null
        ? input.language
        : (resolveLocalizedText(terms.content.body, input.language)?.language ?? 'ca'),
    mediaConsent,
    signing: {
      terms_accepted: true,
      media_consent: mediaConsent,
      signature: signature === UNABLE_TO_DRAW ? null : signature,
      unable_to_draw: signature === UNABLE_TO_DRAW,
      device,
    },
  };
}
