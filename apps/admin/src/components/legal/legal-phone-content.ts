/**
 * The legal forms on her phone (RAPP-695): each screen of the season
 * authorization and of the app terms as `PhoneFrame` draws it, so their
 * boards and screen editors (RAPP-696) preview them as Onboarding does.
 *
 * The order and the content follow her app: re-registration's two screens
 * for a returning player, then the authorization form's screens in the
 * version's order (document, health when it asks something), the consents and
 * signature last; the terms' introduction, then the terms screen.
 */

import { boardStep } from '@/components/onboarding/board-steps';
import {
  builtinPhoneQuestion,
  customPhoneQuestion,
  stepContent,
  type PhoneContent,
  type PhoneQuestion,
  type Translate,
} from '@/components/onboarding/screen-content';
import {
  AUTHORIZATION_BUNDLED_TEXT_KEYS,
  authorizationScreenOrder,
  authorizationWording,
  EMERGENCY_TITLE_REQUIRED_KEY,
  isMiddlePhaseShown,
  numberAuthorizationDocument,
  orderedConsents,
  type AuthorizationContent,
  type AuthorizationText,
  type AuthorizationTextField,
  type EmergencyTextField,
  type HealthTextField,
} from '@ramassa/shared/authorization';
import { resolveLocalizedText } from '@ramassa/shared/i18n';
import type { resolveAppTerms } from '@ramassa/shared/intake';
import {
  reregistrationAsks,
  seasonFormQuestions,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** The authorization's screens; the board orders them as she meets them. */
export const AUTHORIZATION_PHONE_STEPS = [
  'reregistration',
  'reregistrationSeason',
  'document',
  'health',
  'consents',
] as const;

export type AuthorizationPhoneStep = (typeof AUTHORIZATION_PHONE_STEPS)[number];

/** The screen that shows each wording field, so the phone turns to it while staff type. */
export const AUTHORIZATION_FIELD_STEP: Readonly<
  Record<AuthorizationTextField, AuthorizationPhoneStep>
> = {
  intro: 'document',
  flow_label: 'document',
  documents_title: 'document',
  continue_label: 'document',
  health_title: 'health',
  consents_title: 'consents',
  sign_and_enter_label: 'consents',
  sign_label: 'consents',
  required_mark: 'consents',
  signature_title: 'consents',
  signature_prompt: 'consents',
  signature_hint: 'consents',
  cannot_draw_label: 'consents',
  cannot_draw_hint: 'consents',
  reregistration_title: 'reregistration',
  reregistration_intro: 'reregistration',
  reregistration_correct_label: 'reregistration',
  reregistration_edit_label: 'reregistration',
  reregistration_season_intro: 'reregistrationSeason',
};

/** One screen in the frame: its content and its place in the flow. */
export interface PhoneScreen {
  readonly content: PhoneContent;
  readonly step?: number;
  readonly total?: number;
  readonly flowLabel?: string;
}

const EMPTY: Omit<PhoneContent, 'title' | 'continueLabel'> = {
  intro: '',
  help: '',
  questions: [],
  lines: [],
  checkbox: null,
  signature: false,
  declineLabel: null,
};

const withSeason = (text: string, seasonName: string) =>
  text.replace(/\{\{\s*season\s*\}\}/gu, seasonName);

/** The form's screens her phone walks for this content, in order: health only while it asks something. */
function walkedScreens(content: AuthorizationContent) {
  return authorizationScreenOrder(content).filter(
    (screen) => screen !== 'health' || isMiddlePhaseShown(content),
  );
}

/** One screen of the authorization, worded as her app words it in `language`. */
export function authorizationPhoneScreen(
  content: AuthorizationContent,
  step: AuthorizationPhoneStep,
  language: LanguageCode,
  t: Translate,
  options: { readonly seasonName: string; readonly catalog: IntakeCatalog },
): PhoneScreen {
  const { seasonName, catalog } = options;
  const app = (key: string) => t(`onboarding:${key}`, { lng: language, season: seasonName });
  const words = (field: AuthorizationTextField) =>
    withSeason(
      authorizationWording(content.texts, field, language) ??
        app(AUTHORIZATION_BUNDLED_TEXT_KEYS.texts[field]),
      seasonName,
    );
  const { health, emergency_contact: emergency } = content.questions;
  const healthWords = (field: HealthTextField) =>
    authorizationWording(health.texts, field, language) ??
    app(AUTHORIZATION_BUNDLED_TEXT_KEYS.health[field]);
  const emergencyWords = (field: EmergencyTextField) =>
    authorizationWording(emergency.texts, field, language) ??
    app(
      field === 'title' && emergency.required
        ? EMERGENCY_TITLE_REQUIRED_KEY
        : AUTHORIZATION_BUNDLED_TEXT_KEYS.emergency_contact[field],
    );
  const text = (value: AuthorizationText) => resolveLocalizedText(value, language)?.text ?? '';
  const only = (value: string) => ({ [language]: value });
  const field = (
    id: string,
    label: string,
    type: 'short_text' | 'phone',
    heading?: string,
  ): PhoneQuestion => ({
    id,
    label,
    help: '',
    isRequired: false,
    draft: { type, label: only(label), help: {}, settings: {}, options: [] },
    ...(heading === undefined ? {} : { heading }),
  });

  // Her form's screens in the version's order (RAPP-696), health when it asks something.
  const walked = walkedScreens(content);
  const progress = (screen: (typeof walked)[number]) => ({
    step: Math.max(1, walked.indexOf(screen) + 1),
    total: walked.length,
    flowLabel: words('flow_label'),
  });

  if (step === 'document') {
    const numbered = numberAuthorizationDocument(content);
    return {
      ...progress('document'),
      content: {
        ...EMPTY,
        title: text(content.title),
        intro: words('intro'),
        sections: numbered.sections.map((section) => text(section.title)),
        links: {
          title: words('documents_title'),
          labels: content.attachments.map((attachment) => text(attachment.label)),
        },
        continueLabel: words('continue_label'),
      },
    };
  }

  if (step === 'health') {
    const questions: PhoneQuestion[] = [];
    if (health.asked) {
      questions.push({
        id: 'health',
        label: healthWords('question'),
        help: '',
        isRequired: false,
        draft: {
          type: 'single_choice',
          label: only(healthWords('question')),
          help: {},
          settings: {},
          options: [only(healthWords('no_label')), only(healthWords('yes_label'))],
        },
      });
    }
    if (emergency.asked) {
      questions.push(
        field(
          'emergency-name',
          emergencyWords('name_label'),
          'short_text',
          emergencyWords('title'),
        ),
        field('emergency-relation', emergencyWords('relation_label'), 'short_text'),
        field('emergency-phone', emergencyWords('phone_label'), 'phone'),
      );
    }
    return {
      ...progress('health'),
      content: {
        ...EMPTY,
        title: words('health_title'),
        questions,
        continueLabel: words('continue_label'),
      },
    };
  }

  if (step === 'consents') {
    return {
      ...progress('consents'),
      content: {
        ...EMPTY,
        title: words('consents_title'),
        checkboxes: orderedConsents(content).map((consent) => ({
          label: text(consent.label),
          requiredMark: consent.required ? words('required_mark') : null,
        })),
        signatureTexts: {
          title: words('signature_title'),
          prompt: words('signature_prompt'),
          cannotDraw: words('cannot_draw_label'),
        },
        continueLabel: words('sign_and_enter_label'),
      },
    };
  }

  if (step === 'reregistration') {
    // Her details as re-registration lists them; a picture, so no values.
    const rows = (keys: readonly string[]) => keys.map((key) => ({ label: app(key), value: '' }));
    return {
      content: {
        ...EMPTY,
        title: words('reregistration_title'),
        intro: words('reregistration_intro'),
        details: [
          {
            title: app('summarySectionName'),
            rows: rows(['firstNameLabel', 'lastNameLabel', 'dateOfBirthLabel', 'nationalityLabel']),
          },
          {
            title: app('logisticsTitle'),
            rows: rows([
              'phoneLabel',
              'addressLabel',
              'cityLabel',
              'clothingSizeLabel',
              'shoeSizeLabel',
            ]),
          },
        ],
        continueLabel: words('reregistration_correct_label'),
        secondaryLabel: words('reregistration_edit_label'),
      },
    };
  }

  // This season's questions: the app's own the team did not hide, then the team's.
  const asks = reregistrationAsks(catalog);
  return {
    content: {
      ...EMPTY,
      title: words('reregistration_title'),
      intro: words('reregistration_season_intro'),
      questions: [
        ...(
          ['applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'] as const
        )
          .filter((question) => asks(question))
          .map((question) => builtinPhoneQuestion(catalog, question, language, t)),
        ...seasonFormQuestions(catalog).map((question) => customPhoneQuestion(question, language)),
      ],
      continueLabel: words('continue_label'),
    },
  };
}

/** The app terms' two screens, in her onboarding's order. */
export const TERMS_PHONE_STEPS = ['terms-intro', 'terms'] as const;

export type TermsPhoneStep = (typeof TERMS_PHONE_STEPS)[number];

/**
 * One screen of the app terms with the draft's words: the screen's buttons are
 * the onboarding screen's own, its place is its place on the terms board.
 */
export function termsPhoneScreen(
  terms: ReturnType<typeof resolveAppTerms>,
  step: TermsPhoneStep,
  language: LanguageCode,
  t: Translate,
  catalog: IntakeCatalog,
): PhoneScreen {
  const flow = boardStep(catalog, step);
  const position = { step: TERMS_PHONE_STEPS.indexOf(step) + 1, total: TERMS_PHONE_STEPS.length };
  const base =
    flow === null
      ? { ...EMPTY, title: '', continueLabel: '' }
      : stepContent(catalog, flow, language, t);
  if (step === 'terms-intro') {
    return {
      ...position,
      content: {
        ...base,
        title: terms.introTitle,
        intro: terms.intro,
        lines: [],
        blocks: terms.points,
      },
    };
  }
  return {
    ...position,
    content: {
      ...base,
      title: terms.title,
      intro: terms.mediaHint,
      lines: [],
      body: terms.body,
      checkbox: null,
      checkboxes: [
        {
          label: terms.acceptLabel,
          requiredMark: t('onboarding:authorizationRequiredMark', { lng: language }),
        },
        { label: terms.mediaLabel, requiredMark: null },
      ],
      signature: true,
    },
  };
}
