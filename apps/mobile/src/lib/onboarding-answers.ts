/**
 * Her Onboarding answers as she sends them (RAPP-663, RAPP-690), from the
 * draft: her names and settings, her answers by field (only the new or
 * changed ones) and her signatures of the signature blocks. Her first
 * Onboarding (the terms screen) and her review of the screens saved as a
 * Nova versió (RAPP-697) send the same thing.
 *
 * Every stored step re-parses through the SAME schemas the screens used, so
 * nothing unvalidated can reach the payload even from a tampered or stale
 * draft. A failed parse, or a required answer missing anywhere (RAPP-611,
 * RAPP-612), names the screen to send her back to, with her data still in
 * the draft.
 */

import {
  documentationFormSchemaFor,
  identityFormSchemaFor,
  logisticsFormSchemaFor,
} from '@/lib/onboarding-form';
import { appAnswersToSave, customAnswersToSave } from '@/lib/onboarding-intake';
import type { WizardIntake } from '@/lib/onboarding-intake-context';
import { firstIncompleteStep } from '@/lib/wizard-completeness';
import {
  DEFAULT_REQUIRED_QUESTIONS,
  DEFAULT_WIZARD_FLOW,
  type WizardStepKey,
} from '@ramassa/shared/intake';
import {
  appAnswersFromForm,
  appFormField,
  appFormToSend,
  formSignaturesPayload,
  type FieldAnswers,
} from '@ramassa/shared/intake-builder';
import type { OnboardingDraft } from '@ramassa/shared/onboarding-drafts';
import { seasonAnswerFields, type LanguageCode } from '@ramassa/shared/schemas';

export interface OnboardingAnswers {
  readonly first_name: string;
  readonly last_name: string;
  readonly preferred_language: string;
  readonly answers: FieldAnswers;
  readonly signatures: ReturnType<typeof formSignaturesPayload>;
}

export type OnboardingAnswersResult =
  | { readonly ok: true; readonly value: OnboardingAnswers }
  | { readonly ok: false; readonly step: WizardStepKey };

export function onboardingAnswersFromDraft(
  draft: OnboardingDraft | null,
  intake: WizardIntake,
  language: LanguageCode,
): OnboardingAnswersResult {
  const incomplete = firstIncompleteStep(draft, {
    custom: intake.customPlan,
    flow: intake.flow ?? DEFAULT_WIZARD_FLOW,
    required: intake.required,
    customScreens: intake.customScreens,
    storedCustom: intake.customAnswers,
    blocks: intake.catalog.blocks,
  });
  if (incomplete !== null) return { ok: false, step: incomplete };
  const required = intake.required ?? DEFAULT_REQUIRED_QUESTIONS;
  const identity = identityFormSchemaFor(required).safeParse(draft?.identity ?? {});
  if (!identity.success) return { ok: false, step: 'identity' };
  const documentation = documentationFormSchemaFor(required).safeParse(draft?.documentation ?? {});
  if (!documentation.success) return { ok: false, step: 'documentation' };
  const logistics = logisticsFormSchemaFor(required).safeParse(draft?.logistics ?? {});
  if (!logistics.success) {
    const field = logistics.error.issues[0]?.path[0];
    return {
      ok: false,
      step: field === 'clothingSize' || field === 'shoeSize' ? 'equipment' : 'logistics',
    };
  }
  // The registration questions (RAPP-306), all optional: a draft that does
  // not parse goes back to that screen, as the others do.
  const season = seasonAnswerFields.safeParse(draft?.season ?? {});
  if (!season.success) return { ok: false, step: 'season' };

  // Her answers to the app's fields, by field (RAPP-663): the checked forms
  // with the rules every screen shares, then only what is new or changed
  // (RAPP-300). The server keeps every stored answer the payload leaves out,
  // so a staff answer she only confirmed on the summary keeps its source.
  const sent = appFormToSend({
    ...identity.data,
    ...documentation.data,
    ...logistics.data,
    ...season.data,
  });
  const entity = appFormField(intake.fields, 'referenceEntity');
  const appAnswers = appAnswersToSave(
    appAnswersFromForm(intake.fields, sent),
    intake.customAnswers,
    // "None" to the entity question is an answer with no value.
    sent.referenceEntity === null && entity !== undefined ? new Set([entity.id]) : new Set(),
  );

  // Her answers to the staff questions (RAPP-307), only the new or changed
  // ones, checked by the server before anything is kept (RAPP-611).
  const placed = intake.customScreens.flatMap((screen) => screen.questions);
  const customAnswers = customAnswersToSave(placed, draft?.custom, intake.customAnswers);
  // An app field the generic renderer asks (RAPP-665) is saved from there only.
  for (const question of placed) delete appAnswers[question.id];

  return {
    ok: true,
    value: {
      first_name: identity.data.firstName,
      last_name: identity.data.lastName,
      preferred_language: identity.data.preferredLanguage,
      answers: { ...appAnswers, ...customAnswers },
      // Her signature of each block of her Onboarding (RAPP-690), with the
      // language its text was shown in.
      signatures: formSignaturesPayload(
        (intake.catalog.blocks ?? []).filter((block) => block.surface === 'onboarding'),
        draft?.signatures,
        language,
      ),
    },
  };
}
